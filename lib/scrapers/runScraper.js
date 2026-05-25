import crypto from 'node:crypto'
import { verifyApiKey } from '@/lib/middleware/verifyApiKey.js'
import { applyRateLimit } from '@/lib/rateLimit.js'
import { getCache, setCache } from '@/lib/cache.js'
import { dedup } from '@/lib/inflight.js'
import { withRetry } from '@/lib/retry.js'
import { logApiMetric } from '@/lib/metricsLogger.js'
import { clientIp } from '@/lib/clientIp.js'
import { success, failure } from '@/lib/apiResponse.js'
import { bumpUsage } from '@/lib/usage.js'

/**
 * Shared pipeline for scraper endpoints.
 *
 *   Incoming request
 *        │
 *        ▼
 *   0. Mint or accept X-Request-Id  — correlation id used everywhere
 *   1. verifyApiKey      — x-api-key required (bcrypt-compared)
 *   2. applyRateLimit    — Redis sliding window per IP
 *   3. Zod input parse   — caller-supplied schema; rejects bad input
 *      bumpUsage          — increment request_today / request_all
 *   4. getCache          — short-circuit on hit (no upstream call)
 *   5. dedup             — coalesce identical in-flight scrapes
 *   6. withRetry         — exponential backoff on transient upstream errors
 *   7. scraper fn        — actually fetch + parse external data
 *   8. setCache          — store result for next caller
 *   9. logApiMetric      — DB log + Prometheus + Socket.IO + IP analytics
 *
 * Every response — success OR failure — carries an X-Request-Id header
 * matching the requestId field in the ApiLog row and the pino log line.
 * That makes "find me everything about this one bad request" a single
 * grep / Mongo query across all three stores.
 *
 * Why a wrapper?
 *   Every scraper needs the same 9 steps. Duplicating them risks one
 *   route forgetting (say) the cache step and silently melting the
 *   upstream's rate limit, or forgetting the metric step and going
 *   invisible in the dashboard. Centralising the pipeline makes the
 *   safe path the default and the unsafe path harder.
 *
 * Usage:
 *
 *   export async function GET(req) {
 *       return runScraper(req, {
 *           name: 'github.user',
 *           parseInput: (req) => mySchema.safeParse({...}),
 *           cacheKey:   (input) => `gh:user:${input.username}`,
 *           cacheTtl:   60 * 10,
 *           scrape:     async (input) => {
 *               // returns whatever you want serialised in `data`
 *           }
 *       })
 *   }
 */

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/

function extractOrMintRequestId(req) {
    const incoming = req.headers.get('x-request-id')
    if (incoming && SAFE_REQUEST_ID.test(incoming)) {
        return incoming
    }
    return crypto.randomUUID()
}

export async function runScraper(req, opts) {
    const {
        name,             // string — used as endpoint label in metrics & inflight key
        parseInput,       // (req) => { success, data, error }
        cacheKey,         // (input) => string
        cacheTtl = 300,   // seconds; default 5 min
        scrape,           // async (input) => any
        skipCache = false, // bypass cache for this call
        scope = null      // optional ApiKey scope this endpoint requires
    } = opts

    const startedAt = Date.now()
    const method = req.method
    const ip = clientIp(req)
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // --- 0. Correlation ID ---
    const requestId = extractOrMintRequestId(req)

    // Every response — even error paths below — needs this header.
    const responseHeaders = { 'X-Request-Id': requestId }

    // We always emit ONE metric per request, even on error.
    const recordMetric = ({ userId, status, success: ok, cacheHit }) => {
        // Fire-and-forget — metrics must not slow the response path
        // or surface their failures to the caller.
        logApiMetric({
            userId,
            endpoint: name,
            method,
            status,
            success: ok,
            latency: Date.now() - startedAt,
            ip,
            cacheHit,
            userAgent,
            requestId
        }).catch(err => console.error('[runScraper] metric write failed:', err.message))
    }

    // --- 1. API key ---
    let user
    try {
        user = await verifyApiKey(req, { scope })
    } catch (err) {
        recordMetric({ userId: 'anonymous', status: 401, success: false, cacheHit: false })
        return failure(err.message || 'Unauthorized', 401, responseHeaders)
    }

    const userId = user._id.toString()

    // --- 2. Rate limit (per IP, 100/min, 5-min block on breach) ---
    const allowed = await applyRateLimit(ip)
    if (!allowed) {
        recordMetric({ userId, status: 429, success: false, cacheHit: false })
        return failure('Too many requests', 429, responseHeaders)
    }

    // --- 3. Input validation ---
    const parsed = parseInput(req)
    if (!parsed.success) {
        const message = parsed.error?.errors?.[0]?.message || 'Invalid input'
        recordMetric({ userId, status: 400, success: false, cacheHit: false })
        return failure(message, 400, responseHeaders)
    }
    const input = parsed.data

    // Per-user usage counters. Fire-and-forget so the increment never
    // gates the request, but we DO count cache hits below — those are
    // still requests the user made against their quota.
    bumpUsage(userId).catch(err =>
        console.error('[runScraper] bumpUsage failed:', err.message)
    )

    // --- 4. Cache check ---
    const ck = cacheKey(input)
    if (!skipCache) {
        const cached = await getCache(ck)
        if (cached !== undefined && cached !== null) {
            recordMetric({ userId, status: 200, success: true, cacheHit: true })
            return success(cached, 200, responseHeaders)
        }
    }

    // --- 5–7. Dedup + retry + actual scrape ---
    const dedupKey = `${name}:${ck}`
    try {
        const data = await dedup(dedupKey, () => withRetry(() => scrape(input)))

        // --- 8. Populate cache for the next caller ---
        if (data !== undefined && data !== null) {
            await setCache(ck, data, cacheTtl)
        }

        // --- 9. Metric ---
        recordMetric({ userId, status: 200, success: true, cacheHit: false })
        return success(data, 200, responseHeaders)
    } catch (err) {
        // The scraper threw — translate known shapes into HTTP statuses.
        const status = Number.isInteger(err?.status) ? err.status : 502
        const message = err?.message || 'Upstream error'
        recordMetric({ userId, status, success: false, cacheHit: false })
        return failure(message, status, responseHeaders)
    }
}

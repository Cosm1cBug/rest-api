import { verifyApiKey } from '@/lib/middleware/verifyApiKey.js'
import { applyRateLimit } from '@/lib/rateLimit.js'
import { getCache, setCache } from '@/lib/cache.js'
import { dedup } from '@/lib/inflight.js'
import { withRetry } from '@/lib/retry.js'
import { logApiMetric } from '@/lib/metricsLogger.js'
import { clientIp } from '@/lib/clientIp.js'
import { success, failure } from '@/lib/apiResponse.js'

/**
 * Shared pipeline for scraper endpoints.
 *
 *   Incoming request
 *        │
 *        ▼
 *   1. verifyApiKey      — x-api-key required (bcrypt-compared)
 *   2. applyRateLimit    — Redis sliding window per IP
 *   3. Zod input parse   — caller-supplied schema; rejects bad input
 *   4. getCache          — short-circuit on hit (no upstream call)
 *   5. dedup             — coalesce identical in-flight scrapes
 *   6. withRetry         — exponential backoff on transient upstream errors
 *   7. scraper fn        — actually fetch + parse external data
 *   8. setCache          — store result for next caller
 *   9. logApiMetric      — DB log + Prometheus + Socket.IO + IP analytics
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
export async function runScraper(req, opts) {
    const {
        name,             // string — used as endpoint label in metrics & inflight key
        parseInput,       // (req) => { success, data, error }
        cacheKey,         // (input) => string
        cacheTtl = 300,   // seconds; default 5 min
        scrape,           // async (input) => any
        skipCache = false // bypass cache for this call
    } = opts

    const startedAt = Date.now()
    const method = req.method
    const ip = clientIp(req)
    const userAgent = req.headers.get('user-agent') || 'unknown'

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
            userAgent
        }).catch(err => console.error('[runScraper] metric write failed:', err.message))
    }

    // --- 1. API key ---
    let user
    try {
        user = await verifyApiKey(req)
    } catch (err) {
        recordMetric({ userId: 'anonymous', status: 401, success: false, cacheHit: false })
        return failure(err.message || 'Unauthorized', 401)
    }

    const userId = user._id.toString()

    // --- 2. Rate limit (per IP, 100/min, 5-min block on breach) ---
    const allowed = await applyRateLimit(ip)
    if (!allowed) {
        recordMetric({ userId, status: 429, success: false, cacheHit: false })
        return failure('Too many requests', 429)
    }

    // --- 3. Input validation ---
    const parsed = parseInput(req)
    if (!parsed.success) {
        const message = parsed.error?.errors?.[0]?.message || 'Invalid input'
        recordMetric({ userId, status: 400, success: false, cacheHit: false })
        return failure(message, 400)
    }
    const input = parsed.data

    // --- 4. Cache check ---
    const ck = cacheKey(input)
    if (!skipCache) {
        const cached = await getCache(ck)
        if (cached !== undefined && cached !== null) {
            recordMetric({ userId, status: 200, success: true, cacheHit: true })
            return success(cached, 200)
        }
    }

    // --- 5–7. Dedup + retry + actual scrape ---
    // The dedup key is "endpoint + cache key" so two concurrent requests
    // for the same input share one upstream call. Important under
    // burst load — without this, 50 simultaneous requests for the same
    // GitHub user would issue 50 outbound calls.
    const dedupKey = `${name}:${ck}`
    try {
        const data = await dedup(dedupKey, () => withRetry(() => scrape(input)))

        // --- 8. Populate cache for the next caller ---
        // We only set on a successful, non-empty result. `null` is a
        // legitimate "not found" answer but we don't want to cache it
        // here — let the scraper decide via its own return shape.
        if (data !== undefined && data !== null) {
            await setCache(ck, data, cacheTtl)
        }

        // --- 9. Metric ---
        recordMetric({ userId, status: 200, success: true, cacheHit: false })
        return success(data, 200)
    } catch (err) {
        // The scraper threw — translate known shapes into HTTP statuses.
        const status = Number.isInteger(err?.status) ? err.status : 502
        const message = err?.message || 'Upstream error'
        recordMetric({ userId, status, success: false, cacheHit: false })
        return failure(message, status)
    }
}

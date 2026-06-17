import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from './redis.js'

const POINTS = 100
const DURATION_SECONDS = 60
const BLOCK_SECONDS = 300

export const rateLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'api-rate-limit',
    points: POINTS,
    duration: DURATION_SECONDS,
    blockDuration: BLOCK_SECONDS
})

/**
 * Original boolean wrapper — kept for callers that just want pass/fail.
 * New callers should prefer applyRateLimitDetailed() to get headers.
 */
export async function applyRateLimit(ip) {
    try {
        await rateLimiter.consume(ip)
        return true
    } catch (err) {
        console.log('[Redis RateLimit Error', err.message)
        return false
    }
}

/**
 * Return the full rate-limit state so the caller
 * can attach X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset
 * headers to its response. Web standards-ish (no real RFC) but every
 * client library in the wild expects these names.
 *
 * Returns:
 *   { ok: true,  headers: {...} }   on success — caller responds 2xx with headers
 *   { ok: false, headers: {...} }   on limit — caller responds 429 with headers
 *
 * Headers shape:
 *   X-RateLimit-Limit       — total quota in the window
 *   X-RateLimit-Remaining   — quota left after this request
 *   X-RateLimit-Reset       — Unix epoch seconds when the limit resets
 *   Retry-After             — seconds to wait (only on the 429 case)
 *
 * Failures (Redis down) fail OPEN with synthetic headers — same as the
 * existing applyRateLimit() — so a Redis blip doesn't deny service.
 */
export async function applyRateLimitDetailed(ip) {
    try {
        const res = await rateLimiter.consume(ip)
        return {
            ok: true,
            headers: rateLimitHeaders(res, true)
        }
    } catch (res) {
        // rate-limiter-flexible throws the RateLimiterRes object on
        // limit-exceeded (distinguishable from real errors by shape).
        if (res && typeof res.msBeforeNext === 'number') {
            return {
                ok: false,
                headers: rateLimitHeaders(res, false)
            }
        }
        // Real error (Redis down, etc.) — fail open with synthetic headers.
        console.log('[Redis RateLimit Error]', res?.message || res)
        return {
            ok: true,
            headers: {
                'X-RateLimit-Limit':     String(POINTS),
                'X-RateLimit-Remaining': String(POINTS),
                'X-RateLimit-Reset':     String(Math.floor(Date.now() / 1000) + DURATION_SECONDS)
            }
        }
    }
}

function rateLimitHeaders(res, ok) {
    const resetEpoch = Math.floor(Date.now() / 1000 + (res.msBeforeNext || 0) / 1000)
    const h = {
        'X-RateLimit-Limit':     String(POINTS),
        'X-RateLimit-Remaining': String(Math.max(0, res.remainingPoints ?? 0)),
        'X-RateLimit-Reset':     String(resetEpoch)
    }
    if (!ok) {
        h['Retry-After'] = String(Math.ceil((res.msBeforeNext || BLOCK_SECONDS * 1000) / 1000))
    }
    return h
}

import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from '@/lib/redis.js'

// Sliding-window style limiter for dashboard/admin routes.
// 30 requests per 60 seconds per IP, with a 120-second block on breach.
const dashboardLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'dashboard-rate-limit',
    points: 30,             // max requests
    duration: 60,           // per 60 seconds
    blockDuration: 120      // block for 2 minutes on breach
})

/**
 * Apply dashboard rate limiting.
 *
 * Returns an object shaped like { success: boolean } so call sites
 * that previously used @upstash/ratelimit need no changes:
 *
 *   const { success } = await dashboardRateLimit.limit(ip)
 *   if (!success) return Response.json({ error: 'Too many requests' }, { status: 429 })
 *
 * @param {string} ip
 * @returns {Promise<{ success: boolean, remaining?: number, msBeforeNext?: number }>}
 */
async function limit(ip) {
    try {
        const result = await dashboardLimiter.consume(ip)
        return {
            success: true,
            remaining: result.remainingPoints,
            msBeforeNext: result.msBeforeNext
        }
    } catch (rlRejection) {
        // RateLimiterRes is thrown (not an Error) when the limit is exceeded
        return {
            success: false,
            remaining: 0,
            msBeforeNext: rlRejection.msBeforeNext ?? 0
        }
    }
}

export const dashboardRateLimit = { limit }
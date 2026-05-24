import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from '@/lib/redis.js'

const perTargetLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'otp-verify-target',
    points: 10,
    duration: 10 * 60,        // 10 minutes
    blockDuration: 30 * 60    // 30 min lockout on breach
})

const perIpLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'otp-verify-ip',
    points: 50,
    duration: 10 * 60,
    blockDuration: 60 * 60
})

/**
 * Consume one token from BOTH limiters. Returns:
 *   { success: true }                       on allow
 *   { success: false, msBeforeNext: number} on deny
 *
 * @param {string} ip
 * @param {string} email
 */
export async function consumeOtpVerifyLimit(ip, email) {
    const ipKey = ip || 'unknown'
    const targetKey = `${ipKey}|${email}`

    try {
        // Run both consumes; either failure short-circuits to deny.
        await Promise.all([
            perIpLimiter.consume(ipKey),
            perTargetLimiter.consume(targetKey)
        ])
        return { success: true }
    } catch (rej) {
        return {
            success: false,
            msBeforeNext: rej?.msBeforeNext ?? 60_000
        }
    }
}

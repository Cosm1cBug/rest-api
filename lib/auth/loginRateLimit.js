import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from '@/lib/redis.js'

const perIpLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'login-ip',
    points: 20,             // 20 attempts
    duration: 10 * 60,      // per 10 minutes
    blockDuration: 30 * 60  // 30-min lockout on breach
})

const perTargetLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'login-target',
    points: 10,             // 10 attempts
    duration: 10 * 60,      // per 10 minutes
    blockDuration: 30 * 60
})

/**
 * Consume one token from BOTH limiters. Returns:
 *   { success: true }                       on allow
 *   { success: false, msBeforeNext: number} on deny
 *
 *
 * @param {string} ip
 * @param {string} email
 */
export async function consumeLoginLimit(ip, email) {
    const ipKey = ip || 'unknown'
    const targetKey = `${ipKey}|${(email || '').toLowerCase()}`

    try {
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

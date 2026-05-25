import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from '@/lib/redis.js'

const requestPerEmail = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'pwreset-req-email',
    points: 3,             // 3 emails per
    duration: 60 * 60,     // 1 hour
    blockDuration: 60 * 60
})

const requestPerIp = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'pwreset-req-ip',
    points: 10,
    duration: 60 * 60,
    blockDuration: 60 * 60
})

const verifyPerIp = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'pwreset-verify-ip',
    points: 20,
    duration: 60 * 60,
    blockDuration: 60 * 60
})

export async function consumeResetRequestLimit(ip, email) {
    try {
        await Promise.all([
            requestPerIp.consume(ip || 'unknown'),
            requestPerEmail.consume((email || '').toLowerCase() || 'unknown')
        ])
        return { success: true }
    } catch (rej) {
        return { success: false, msBeforeNext: rej?.msBeforeNext ?? 60_000 }
    }
}

export async function consumeResetVerifyLimit(ip) {
    try {
        await verifyPerIp.consume(ip || 'unknown')
        return { success: true }
    } catch (rej) {
        return { success: false, msBeforeNext: rej?.msBeforeNext ?? 60_000 }
    }
}

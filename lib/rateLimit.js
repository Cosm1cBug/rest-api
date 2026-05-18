import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from './redis.js'

export const rateLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'api-rate-limit',
    points: 100,
    duration: 60,
    blockDuration: 300
}) 

export async function applyRateLimit(ip) {
    try {
        await rateLimiter.consume(ip)
        return true
    } catch (err) {
        console.log('[Redis RateLimit Error', err.message)
        return false
    }
}

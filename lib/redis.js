import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL, {
    maxRetryPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
        return Math.min(times * 50, 2000)
    }
})

redis.on('connect', () => {
    console.log('[Redis] Connected.')
})

redis.on('error', err => {
    console.error('[Redis Error]', err)
})
import Redis from 'ioredis'

export const redis = new Redis({

    host: process.env.REDIS_HOST,

    port: process.env.REDIS_PORT,

    password: process.env.REDIS_PASSWORD,

    maxRetriesPerRequest: 5,

    retryStrategy(times) {

        return Math.min(times * 100, 3000)
    },
    reconnectOnError() {
        return true
    }
})

redis.on('connect', () => {
    console.log('[Redis] Connected.')
})

redis.on('error', (err) => {
    console.error('[Redis Error]', err.message)
})

redis.on('reconnecting', () => {
    console.log('[Redis] Reconnecting...')
})
import Redis from 'ioredis'

const baseOpts = {
    host:           process.env.REDIS_HOST,
    port:           process.env.REDIS_PORT,
    password:       process.env.REDIS_PASSWORD,
    lazyConnect:    true,
    retryStrategy(times) {
        return Math.min(times * 100, 3000)
    },
    reconnectOnError() {
        return true
    }
}

export const redis = new Redis({
    ...baseOpts,
    maxRetriesPerRequest: 5
})


export const bullmqRedis = new Redis({
    ...baseOpts,
    maxRetriesPerRequest: null
})

for (const [name, client] of [['Redis', redis], ['BullMQ Redis', bullmqRedis]]) {
    client.on('connect',      () => console.log(`[${name}] Connected.`))
    client.on('error',        (err) => console.error(`[${name} Error]`, err.message))
    client.on('reconnecting', () => console.log(`[${name}] Reconnecting...`))
}


export function connectRedis() {
    return Promise.all([
        redis.connect().catch(err => console.error('[Redis] eager connect failed:', err.message)),
        bullmqRedis.connect().catch(err => console.error('[BullMQ Redis] eager connect failed:', err.message))
    ])
}

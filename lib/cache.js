import { redis } from './redis.js'
import { trackCacheHit, trackCacheMiss } from '@/lib/telemetry.js'

export async function getCache(key) {
    try{

        const data = await redis.get(key)

        if (data) {
            trackCacheHit()
            return JSON.parse(data)
        }

        trackCacheMiss()

    } catch (err) {
        console.error(`[Redis Cache GET Error]`, err.message)
        return null
    }

}

export async function setCache(key, value, ttl =300) {
    try {
        await redis.setex(
            key,
            ttl,
            JSON.stringify(value)
        )
    } catch (err) {
        console.error('[Cache Cache Set Error]', err.message)
    }
}

export async function deleteCache(key) {
    try {
        await redis.del(key)
    } catch (err) {
        console.error('[Cache Cache Delete Error]', err.message)
    }
}

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

export async function setCache(key, value, ttl =3600) {
    try {
        await redis.set(
            key,
            value,
            {
                ex: ttl
            }
            
        ) 
        
        return JSON.stringify(value)

    } catch (err) {
        console.error('[Cache Cache Set Error]', err.message)

        return false
    }
}

export async function deleteCache(key) {
    try {
        await redis.del(key)
        return true
    } catch (err) {
        console.error('[Cache Cache Delete Error]', err.message)
        return false
    }
}

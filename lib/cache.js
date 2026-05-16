import { redis } from './redis.js'
import {
    trackCacheHit,
    trackCacheMiss
}
from '@/lib/telemetry.js'

export async function getCache(
    key
) {

    const data =
        await redis.get(key)

    if (data) {

        trackCacheHit()

        return JSON.parse(data)
    }

    trackCacheMiss()

    return null
}

export async function setCache(key, value, ttl =300) {
    try {
        await redis.setex(
            key,
            ttl,
            JSON.stringify(value)
        )
    } catch (err) {
        console.error('[Cache Set Error]', err)
    }
}

export async function deleteCache(key) {
    try {
        await redis.del(key)
    } catch (err) {
        console.error('[Cache Delete Error]', err)
    }
}

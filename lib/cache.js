import { redis } from './redis.js'

export async function getCache(key) {
    try {
        const data = await redis.get(key)

        return data ? JSON.parse(data) : null
    } catch (err) {
        console.error('[Cache Get Error]', err)
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
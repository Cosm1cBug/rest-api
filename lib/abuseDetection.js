import { redis } from './redis.js'

/**
 * Detect abusive request volume from a single source.
 * @param {string} ip
 * @param {number} [windowMs=60_000] sliding window length
 * @param {number} [threshold=100]   max requests in the window before "abusive"
 * @returns {Promise<boolean>} true if the source is currently abusive
 */
export async function detectAbuse(ip, windowMs = 60_000, threshold = 100) {

    if (!ip) return false

    const key = `abuse:${ip}`
    const now = Date.now()
    const cutoff = now - windowMs

    const pipeline = redis.multi()
    pipeline.zremrangebyscore(key, 0, cutoff)
    pipeline.zadd(key, now, `${now}-${Math.random()}`)
    pipeline.zcard(key)
    pipeline.pexpire(key, windowMs * 2) // bounded TTL

    const results = await pipeline.exec()

    // ioredis exec() returns [[err, value], ...]
    const count = results?.[2]?.[1] ?? 0

    return count > threshold
}
import { redis } from './redis.js'

/**
 * Redis-backed IP analytics.
 */
const TTL_MS = 24 * 60 * 60 * 1000   // 24 hours
const TOP_N_DEFAULT = 20
const TOP_N_CAP = 100                // hard upper bound on ZSET size

const KEY_TOP = 'ip-analytics:top'
const keyIp = (ip) => `ip-analytics:ip:${ip}`
const keyEp = (ip) => `ip-analytics:ip:${ip}:endpoints`

/**
 * Record a hit from `ip` against `endpoint`.
 *
 * @param {string} ip
 * @param {string} endpoint
 * @returns {Promise<void>}
 */
export async function trackIP(ip, endpoint) {
    if (!ip || typeof ip !== 'string') return
    if (!endpoint || typeof endpoint !== 'string') endpoint = 'unknown'

    const now = Date.now()

    try {
        const pipeline = redis.multi()

        // Bump global rank
        pipeline.zincrby(KEY_TOP, 1, ip)
        pipeline.pexpire(KEY_TOP, TTL_MS)

        // Per-IP summary
        pipeline.hincrby(keyIp(ip), 'requests', 1)
        // hsetnx only writes if the field is missing — preserves firstSeen
        pipeline.hsetnx(keyIp(ip), 'firstSeen', now)
        pipeline.hset(keyIp(ip), 'lastSeen', now)
        pipeline.pexpire(keyIp(ip), TTL_MS)

        // Per-endpoint counts
        pipeline.hincrby(keyEp(ip), endpoint, 1)
        pipeline.pexpire(keyEp(ip), TTL_MS)

        await pipeline.exec()

        // Probabilistically trim the ZSET so it can't grow without bound.
        // 1% chance per write keeps amortised cost negligible.
        if (Math.random() < 0.01) {
            const size = await redis.zcard(KEY_TOP)
            if (size > TOP_N_CAP) {
                // Remove everything below the top TOP_N_CAP entries by rank.
                // ZREMRANGEBYRANK 0 -(TOP_N_CAP+1) keeps the highest scores.
                await redis.zremrangebyrank(KEY_TOP, 0, size - TOP_N_CAP - 1)
            }
        }
    } catch (err) {
        // Never let analytics failures bubble up.
        console.error('[ipAnalytics.trackIP]', err.message)
    }
}

/**
 * Return the top N IPs by request count over the current 24h window.
 *
 * @param {number} [limit=20]
 * @returns {Promise<Array<[string, {
 *   requests: number,
 *   endpoints: Record<string, number>,
 *   firstSeen: number,
 *   lastSeen: number
 * }]>>}
 */
export async function getTopIPs(limit = TOP_N_DEFAULT) {
    const n = Math.max(1, Math.min(limit, TOP_N_CAP))

    try {
        // ZREVRANGE with WITHSCORES gives us [ip1, score1, ip2, score2, ...]
        const flat = await redis.zrevrange(KEY_TOP, 0, n - 1, 'WITHSCORES')

        if (!flat || flat.length === 0) return []

        const ips = []
        for (let i = 0; i < flat.length; i += 2) {
            ips.push({ ip: flat[i], requests: Number(flat[i + 1]) })
        }

        // Pipeline the per-IP detail fetches in one round-trip.
        const pipeline = redis.multi()
        for (const { ip } of ips) {
            pipeline.hgetall(keyIp(ip))
            pipeline.hgetall(keyEp(ip))
        }
        const results = await pipeline.exec()

        const out = []
        for (let i = 0; i < ips.length; i++) {
            // ioredis: each result is [err, value]
            const summary = results[i * 2]?.[1] || {}
            const endpoints = results[i * 2 + 1]?.[1] || {}

            // Coerce numeric string fields back to numbers.
            const endpointCounts = {}
            for (const [ep, c] of Object.entries(endpoints)) {
                endpointCounts[ep] = Number(c)
            }

            out.push([
                ips[i].ip,
                {
                    requests: ips[i].requests || Number(summary.requests) || 0,
                    endpoints: endpointCounts,
                    firstSeen: Number(summary.firstSeen) || 0,
                    lastSeen: Number(summary.lastSeen) || 0
                }
            ])
        }

        return out
    } catch (err) {
        console.error('[ipAnalytics.getTopIPs]', err.message)
        return []
    }
}

/**
 * Wipe all analytics data. Useful for tests / admin reset.
 *
 * @returns {Promise<void>}
 */
export async function resetIpAnalytics() {
    try {
        const stream = redis.scanStream({ match: 'ip-analytics:*', count: 500 })
        const toDelete = []
        for await (const keys of stream) {
            if (keys.length) toDelete.push(...keys)
        }
        if (toDelete.length) {
            await redis.del(...toDelete)
        }
    } catch (err) {
        console.error('[ipAnalytics.resetIpAnalytics]', err.message)
    }
}

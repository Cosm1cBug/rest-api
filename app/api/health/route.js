import mongoose from 'mongoose'
import { redis } from '@/lib/redis.js'
import { checkAdminKey } from '@/lib/auth/adminKey.js'

const REDIS_PING_TIMEOUT_MS = 2000

const PUBLIC_HEADERS = {
    'Cache-Control': 'no-store',
    'Content-Type':  'application/json; charset=utf-8'
}

async function pingRedis() {
    try {
        const result = await Promise.race([
            redis.ping(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), REDIS_PING_TIMEOUT_MS)
            )
        ])
        return result === 'PONG' ? 'connected' : 'disconnected'
    } catch {
        return 'disconnected'
    }
}

function mongoStatus() {
    try {
        return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    } catch {
        return 'disconnected'
    }
}

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Public]
 *     summary: Liveness + readiness probe (LB-safe minimal payload)
 *     description: |
 *       Anonymous response is intentionally minimal — `{status, timestamp}` only —
 *       so the endpoint is safe to publish to public LB health checks without
 *       leaking internal architecture. Adding a valid `x-admin-key` header returns
 *       a richer payload including Mongo + Redis connection state.
 *     parameters:
 *       - in: header
 *         name: x-admin-key
 *         required: false
 *         schema: { type: string }
 *         description: Optional. If valid, response includes Mongo + Redis details.
 *     responses:
 *       200:
 *         description: Healthy. `status` is `ok` or `degraded`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:    { type: string, enum: [ok, degraded] }
 *                 timestamp: { type: integer, description: Unix epoch ms }
 *                 mongodb:   { type: string, description: '(admin-key only)' }
 *                 redis:     { type: string, description: '(admin-key only)' }
 *       503:
 *         description: At least one downstream dependency is unreachable.
 */
export async function GET(req) {

    const [mongo, redisStatus] = await Promise.all([
        Promise.resolve(mongoStatus()),
        pingRedis()
    ])

    const healthy = mongo === 'connected' && redisStatus === 'connected'

    const wantsDetail = checkAdminKey(req) === null

    const body = {
        status: healthy ? 'ok' : 'degraded',
        timestamp: Date.now(),
        ...(wantsDetail && {
            services: {
                mongodb: mongo,
                redis:   redisStatus
            }
        })
    }

    return Response.json(body, {
        status: healthy ? 200 : 503,
        headers: PUBLIC_HEADERS
    })
}

export const dynamic = 'force-dynamic'
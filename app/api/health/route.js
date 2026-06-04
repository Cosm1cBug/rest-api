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
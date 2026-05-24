import mongoose from 'mongoose'
import { redis } from '@/lib/redis.js'

export async function GET() {

    let mongo = 'disconnected'
    let redisStatus = 'disconnected'

    try {
        mongo = mongoose.connection.readyState === 1
            ? 'connected'
            : 'disconnected'

    } catch {}

    try {
        await redis.ping()

        redisStatus = 'connected'

    } catch {}

    const healthy = mongo === 'connected' && redisStatus === 'connected'

    return Response.json({

        status: healthy ? 'ok' : 'degraded',
        mongodb: mongo,
        redis: redisStatus,
        timestamp: Date.now()
    },
    {
        status: healthy ? 200 : 503
    })
}
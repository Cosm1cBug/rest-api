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

    return Response.json({

        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        mongodb: mongo,
        redis: redisStatus,
        timestamp: Date.now()
    })
}
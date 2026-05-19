import mongoose from 'mongoose'
import { redis } from '@/lib/redis.js'

export async function gracefulShutdown(signal) {

    console.log(`[Shutdown] ${signal}`)

    try {

        await mongoose.disconnect()
        console.log('[MongoDB] Disconnected')

    } catch (err) {
        console.error(err)
    }

    try {

        await redis.quit()
        console.log('[Redis] Closed')

    } catch (err) {
        console.error(err)
    }

    process.exit(0)
}
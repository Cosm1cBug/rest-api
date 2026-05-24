import { scraperQueue } from '@/lib/bullmq.js'
import { getQueueStats } from '@/lib/queueTelemetry.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied
    
    const counts = await scraperQueue.getJobCounts()

    return Response.json({
        ...counts,
        telemetry: getQueueStats()
    })
}
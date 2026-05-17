import { scraperQueue } from '@/lib/bullmq.js'
import { getQueueStats } from '@/lib/queueTelemetry.js'

export async function GET() {

    const counts = await scraperQueue.getJobCounts()

    return Response.json({
        ...counts,
        telemetry: getQueueStats()
    })
}
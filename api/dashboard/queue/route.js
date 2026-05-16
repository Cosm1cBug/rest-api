import { scraperQueue } from '@/lib/bullmq'

export async function GET() {

    const waiting = await scraperQueue.getWaitingCount()

    const active = await scraperQueue.getActiveCount()

    const completed = await scraperQueue.getCompletedCount()

    const failed = await scraperQueue.getFailedCount()

    return Response.json({
        waitng,
        active,
        completed,
        failed
    })
}
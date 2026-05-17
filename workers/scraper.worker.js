import { Worker } from 'bullmq'
import { redis } from '@/lib/redis.js'
import { youtube } from '@/lib/scrapers/youtube.js'
import { updateQueueStats } from '@/lib/queueTelemetry.js'
import { trackWorkerCompleted, trackWorkerFailed } from '@/lib/telemetry.js'

const worker = new Worker('scraper-queue', async job => {
    try {
        console.log('[Worker] Processing:', job.name)
        // YOUR SCRAPER LOGIC HERE
        const duration = Date.now() - start

        updateQueueStats({
            lastJob: {
                id: job.id,
                name: job.name,
                duration,
                completedAt: Date.now()
            }
        })

        trackWorkerCompleted()

        return { success: true }

    } catch (err) {
        trackWorkerFailed()
        throw err
    }

},
{
    connection: redis,
    concurrency: 5
})

worker.on('completed', async () => {

    const counts = await worker.getJobCounts()
    updateQueueStats(counts)
})

worker.on('failed', async () => {
    
    const counts = await worker.getJobCounts()
    updateQueueStats(counts)
})

console.log('[Worker] Started')
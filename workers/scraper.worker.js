import { Worker, scraperQueue } from '@/lib/bullmq.js'
import { redis } from '@/lib/redis.js'
import { updateQueueStats } from '@/lib/queueTelemetry.js'
import { trackWorkerCompleted, trackWorkerFailed } from '@/lib/telemetry.js'

const worker = new Worker('scraper-queue', async job => {
    
    const start = Date.now()

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
    concurrency: 5,
    removeOnComplete: true,
    removeOnFail: 5000
})

// Worker heartbeat + online status
setInterval(() => {

    updateQueueStats({
        workersOnline: 1,
        heartbeat: Date.now()
    })

}, 5000)

worker.on('completed', async (job) => {

    const counts = await scraperQueue.getJobCounts()
    updateQueueStats(counts)

    console.log(`[Worker] Completed ${job.id}`)
})

worker.on('failed', async (job, err) => {
    
    const counts = await scraperQueue.getJobCounts()
    updateQueueStats(counts)

    console.log(`[Worker] Failed ${job.id}`)
})

console.log('[Worker] Started')
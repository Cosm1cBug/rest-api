import { Queue, QueueEvents } from 'bullmq'
import { redis } from './redis.js'

export const scraperQueue = new Queue('scraper-queue', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: {
            age: 3600,
            count: 1000
        },
        removeOnFail: {
            age: 86400,
            count: 5000
        }
    }
})

export const scraperQueueEvents = new QueueEvents('scraper', { connection: redis })

scraperQueueEvents.on('completed', ({ jobId }) => {

    console.log(`[Queue] Job completed: ${jobId}`)
})

scraperQueueEvents.on('failed', ({ jobId, failedReason }) => {

    console.error(`[Queue] Job failed: ${jobId}`, failedReason)
})

scraperQueueEvents.on('stalled', ({ jobId }) => {

    console.warn(`[Queue] Job stalled: ${jobId}`)
})
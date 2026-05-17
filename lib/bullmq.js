import { Queue } from 'bullmq'
import { redis } from './redis.js'

export const scraperQueue = new Queue('scraper-queue', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: 1000,
        removeOnFail: 5000
    }
})
import { Queue } from 'bullmq'
import { redis } from './redis'

export const scraperQueue = new Queue('scraper-queue', {
    connection: redis
})
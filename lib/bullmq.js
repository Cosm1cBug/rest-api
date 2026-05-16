import { Queue } from 'bullmq'
import { redis } from './redis.js'

export const scraperQueue = new Queue('scraper-queue', {
    connection: redis
})
import { worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { youtube } from '@/lib/scrapers/youtube'

new Worker(
    'scraper-queue',
    async job => {
        switch (job.name) {
            case 'youtube':
                return await youtube(job.data.url)
            
            default:
                throw new Error('Unknown job')
        }
    },
    {
        connection: redis,
        concurrency: 5
    }
)
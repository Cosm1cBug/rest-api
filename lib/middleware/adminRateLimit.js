import { RateLimit } from '@/upstash/ratelimit'
import { redis } from '@/lib/redis'

export const dashboardRateLimit = new RateLimit({
    redis,
    limiter: RateLimit.slidingWindow(
        30,
        '1 m'
    ),
    analytics: true

})
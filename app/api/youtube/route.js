import { success, failure } from '@/lib/apiResponse'
import { handleError } from '@/lib/errorHandler'
import { requestLogger } from '@/lib/middleware/requestLogger'
import { applyRateLimit } from '@/lib/rateLimit'
import { verifyApiKey } from '@/lib/middleware/apiKey'
import { validateUrl } from '@/lib/security/ssrf'
import { getCache, setCache } from '@/lib/cache'
import { dedupe } from '@/lib/inflight'
import { withRetry } from '@/lib/retry'
import { globalQueue } from '@/lib/queue'
import { youtube } from '@/lib/scrapers/youtube'

export async function POST(req) {
    try {
        await requestLogger(req)

        const ip = req.headers.get('x-forwarded-for') || 'unknown'

        const allowed = await applyRateLimit(ip)
        if (!allowed) {
            return failure('Rate limit exceeded', 429)
        }

        await verifyApiKey(req)

        const body = await req.json()
        if (!body.url) {
            return failure('URL missing', 400)
        }

        await validateUrl(body.url)

        const cacheKey = `yt:${body.url}`

        const cached = await getCache(cacheKey)
        if (cached) {
            return success(cached)
        }

        const result = await dedupe(cacheKey, async () => {
            return await globalQueue.add(async () => {
                return await withRetry(async () => {
                    return await youtube(body.url)
                })
            })
        })

        await setCache(cacheKey, result, 300)
        return success(result)

        await logApiMetric({
            userId: user?._id?.toString(),
            endpoint: 'api/youtube',
            method: 'POST',
            status: 200,
            success: true,
            latency: Date.now() - start,
            ip,
            cacheHit: true
        })
        
    } catch (err) {
        return handleError(err)
    }
}
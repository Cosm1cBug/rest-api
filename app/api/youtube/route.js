import { success, failure } from '@/lib/apiResponse.js'
import { handleError } from '@/lib/errorHandler.js'
import { requestLogger, completeRequest } from '@/lib/middleware/requestLogger.js'
import { logApiMetric } from '@/lib/metricsLogger.js'
import { applyRateLimit } from '@/lib/rateLimit.js'
import { verifyApiKey } from '@/lib/middleware/apiKey.js'
import { validateUrl } from '@/lib/security/ssrf.js'
import { getCache, setCache } from '@/lib/cache.js'
import { dedupe } from '@/lib/inflight.js'
import { withRetry } from '@/lib/retry.js'
import { globalQueue } from '@/lib/queue.js'
import { youtube } from '@/lib/scrapers/youtube.js'
import { youtubeSchema } from '@/lib/validators/youtube.js'

export const runtime = 'nodejs'

export const maxDuration = 30

export async function POST(req) {
    try {
        const tracker = await requestLogger(req)

        const ip = req.headers.get('x-forwarded-for') || 'unknown'

        const allowed = await applyRateLimit(ip)
        if (!allowed) {
            return failure('Rate limit exceeded', 429)
        }

        await verifyApiKey(req)

        const raw = await req.json()

        if (raw.length > 1024 * 1024) {
            return Response.json({
                error: 'Payload too large'
            },
            {
                status: 413
            }
        )}

        const text = JSON.parse(raw)

        const body = youtubeSchema.parse(text)

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
        return success(result)
        
    } catch (err) {
        completeRequest({
            requestId: tracker.requestId,
            start: tracker.start,
            status: 500
        })

        await logApiMetric({
            req,
            endpoint: '/api/youtube',
            status: 500,
            duration: Date.now() - tracker.start
})
        return handleError(err)
    }
}


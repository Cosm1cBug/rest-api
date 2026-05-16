import ApiLog from '@/models/apiLog.js'
import geoip from 'geoip-lite'
import { emitMetric } from '@/lib/liveMetrics.js'

export async function logApiMetric({
    userId = 'anonymous',
    endpoint,
    method,
    status,
    success,
    latency,
    ip,
    cacheHit = false,
    quotaUsed = 1,
    userAgent = 'unknown'
}) {
    try {
        const geo = geoip.lookup(ip)

        await ApiLog.create({

            userId,
            endpoint,
            method,
            status,
            success,
            latency,
            ip,
            cacheHit,
            quotaUsed,
            userAgent,
            country: geo?.country || 'unknown',
            region: geo?.region || 'unknown',
            city: geo?.city || 'unknown'
        })

        emitMetric( 'api-request', {
            endpoint,
            status,
            success,
            latency,
            createdAt: Date.now()
        })
        
    } catch (err) {
        console.error('[Metrics Logger Error]', err)
    }
}

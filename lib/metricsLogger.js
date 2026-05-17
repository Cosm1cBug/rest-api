import ApiLog from '@/models/apiLog.js'
import geoip from 'geoip-lite'
import { emitMetric } from '@/lib/liveMetrics.js'
import { trackRequest } from '@/lib/telemetry.js'
import { trackIP } from '@/lib/ipAnalytics.js'
import { detectAbuse } from '@/lib/abuseDetection.js'
import { requestCounter, latencyHistogram } from '@/lib/prometheus.js'

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

        trackIP(ip, endpoint)
        
        const suspicious = detectAbuse(ip)
        if (suspicious) { console.warn('[ABUSE DETECTED]', ip )}

        emitMetric( 'api-request', {
            endpoint,
            status,
            success,
            latency,
            createdAt: Date.now()
        })

        trackRequest({
            endpoint,
            status,
            duration
        })
        
        requestCounter.inc()

        latencyHistogram.observe(duration)
        
    } catch (err) {
        console.error('[Metrics Logger Error]', err)
    }
}

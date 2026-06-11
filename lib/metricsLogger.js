import ApiLog from '@/models/apiLog.js'
import geoip from 'geoip-lite'
import { emitMetric } from '@/lib/liveMetrics.js'
import { trackRequest } from '@/lib/telemetry.js'
import { trackIP } from '@/lib/ipAnalytics.js'
import { detectAbuse } from '@/lib/abuseDetection.js'
import { requestCounter, latencyHistogram } from '@/lib/prometheus.js'
import { getSiemSink } from '@/lib/audit/siemSink.js'

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
    userAgent = 'unknown',
    requestId = null
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
            requestId,
            country: geo?.country || 'unknown',
            region:  geo?.region  || 'unknown',
            city:    geo?.city    || 'unknown'
        })

        // --- SIEM forwarding (best-effort) ---
        // _type='apilog' lets Wazuh rules split the per-request firehose
        // from the audit stream. ECS-style nested fields (source.ip,
        // http.request.method, etc.) so Wazuh + ELK can map without a
        // custom decoder. Volume note: this fires on EVERY API request, so
        // operators should tune their wazuh-agent's <localfile> ignore_lines
        // / max-size or use a dedicated <location> + rotation policy.
        const sink = getSiemSink()
        if (sink) {
            sink.emit({
                _type: 'apilog',
                '@timestamp': new Date().toISOString(),
                user: { id: userId },
                http: {
                    request: { method, id: requestId },
                    response: { status_code: status }
                },
                event: {
                    duration_ms: latency,
                    outcome: success ? 'success' : 'failure',
                    dataset: 'orbitnode.apilog'
                },
                url: { path: endpoint },
                source: {
                    ip,
                    geo: {
                        country_iso_code: geo?.country || null,
                        region_name: geo?.region || null,
                        city_name: geo?.city || null
                    }
                },
                user_agent: { original: userAgent },
                orbitnode: {
                    cache_hit: cacheHit,
                    quota_used: quotaUsed
                }
            })
        }

        trackIP(ip, endpoint).catch(err =>
            console.error('[metricsLogger.trackIP]', err.message)
        )

        const suspicious = await detectAbuse(ip)
        if (suspicious) {
            console.warn('[ABUSE DETECTED]', ip)

            // SIEM signal: surface abuse detection so Wazuh can correlate alert on patterns the in-app counter caught.
            const sink2 = getSiemSink()
            if (sink2) {
                sink2.emit({
                    _type: 'security',
                    '@timestamp': new Date().toISOString(),
                    event: {
                        kind: 'alert',
                        category: ['intrusion_detection'],
                        action: 'abuse_detected',
                        dataset: 'orbitnode.abuse'
                    },
                    source: { ip },
                    url: { path: endpoint }
                })
            }
        }

        emitMetric('api-request', {
            endpoint,
            status,
            success,
            latency,
            requestId,
            createdAt: Date.now()
        })

        trackRequest({
            endpoint,
            status,
            duration: latency
        })

        requestCounter.inc()
        latencyHistogram.observe(latency)

    } catch (err) {
        console.error('[Metrics Logger Error]', err)
    }
}

import client from 'prom-client'

export const requestCounter = new client.Counter({
    name: 'api_requests_total',
    help: 'Total API requests'
})

export const latencyHistogram = new client.Histogram({
    name: 'api_latency_ms',
    help: 'API request latency in milliseconds',
    buckets: [50, 100, 200, 500, 1000]
})

/**
 * SIEM sink failure counter.
 *
 * The sink itself throttles error logging to once per 60s to avoid
 * disk spam (see lib/audit/siemSink.js). That makes the failure
 * invisible to operators unless they tail process logs. This counter
 * surfaces the same signal as a Prometheus metric, so a Grafana alert
 * can fire on `rate(siem_emit_failures_total[5m]) > 0` and operators
 * know about file-permission regressions, disk-full conditions, or
 * agent-side log rotation breakage in minutes, not days.
 *
 * Label `reason` lets the alert separate write-stream errors (e.g.
 * ENOSPC) from JSON-stringify errors (rare; usually a circular
 * reference snuck into an audit `before/after` diff).
 */
export const siemEmitFailures = new client.Counter({
    name: 'siem_emit_failures_total',
    help: 'Audit/apilog/security events that failed to reach the SIEM sink file',
    labelNames: ['reason']
})

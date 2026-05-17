import { emitMetric } from "@/lib/liveMetrics.js"

const telemetry = {
    requests: 0,
    success: 0,
    failed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    activeRequests: 0,
    totalLatency: 0,
    latencySamples: [],
    endpoints: {},
    statusCodes: {},
    workers: {
        active: 0,
        completed: 0,
        failed: 0
    }
}

export function trackRequest({
    endpoint,
    status,
    duration
}) {
    telemetry.requests++
    telemetry.activeRequests++
    telemetry.totalLatency += duration
    telemetry.latencySamples.push(duration)

    if (telemetry.latencySamples.length > 100) {
        telemetry.latencySamples.shift()
    }

    if (status >= 200 && status < 400) {
        telemetry.success++
    } else {
        telemetry.failed++
    }

    telemetry.endpoints[endpoint] = (telemetry.endpoints[endpoint] || 0) + 1

    telemetry.statusCodes[status] = (telemetry.statusCodes[status] || 0) + 1

    setTimeout(() => {
        telemetry.activeRequests--

    }, 1000)

    emitMetric(
        getTelemetry()
    )
}

export function trackCacheHit() {
    telemetry.cacheHits++
}

export function trackCacheMiss() {
    telemetry.cacheMisses++
}

export function trackWorkerCompleted() {
    telemetry.workers.completed++
}

export function trackWorkerFailed() {
    telemetry.workers.failed++
}

export function getTelemetry() {
    const hitRatio = telemetry.cacheHits + telemetry.cacheMisses ? (telemetry.cacheHits / (telemetry.cacheHits + telemetry.cacheMisses)) * 100 :0

    return {
        ...telemetry,
        avgLatency,
        cacheHitRatio: Math.round(hitRatio)
    }
}

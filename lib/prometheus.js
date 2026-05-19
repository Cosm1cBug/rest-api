import client from 'prom-client'

export const requestCounter = new client.Counter({
    name: 'api_requests_total',        
    help: 'Total API Requests'
})

export const latencyHistogram = new client.Histogram({
    name: 'api_latency_ms',
    help: 'API Latency',
    buckets: [
        50,
        100,
        200,
        500,
        1000
    ]
})
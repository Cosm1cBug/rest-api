import client from 'prom-client'

export const requestCounter = new client.Counter({
    name: 'api_requests_total',
    help: 'Total API Requests'
})

export const requestDuration = new client.Histogram({
    name: 'api_requests_duration_seconds',
    help: 'API Requests Duration'
})
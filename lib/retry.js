import pRetry from 'p-retry'

export async function withRetry(fn) {
    return await pRetry(fn, {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000
    })
}
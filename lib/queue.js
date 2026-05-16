import PQueue from 'p-queue'

export const globalQueue = new PQueue({
    concurrency: 5,
    interval: 1000,
    intervalCap: 10
})
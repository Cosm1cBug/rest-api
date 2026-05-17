import { object } from "zod"

const queueStats = {
    active: 0,
    waiting: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    retries: 0,
    workersOnline: 0,
    lastJob: null
}

export function updateQueueStats(stats) {
    object.assign(queueStats, stats)
}

export function getQueueStats() {
    return queueStats
}
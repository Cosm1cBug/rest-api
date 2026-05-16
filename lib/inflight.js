const inflight = new Map()

export async function dedup(key, fn) {
    if (inflight.has(key)) {
        return inflight.get(key)
    }

    const promise = fn()

    inflight.set(key, promise)
    try {
        return await promise
    } finally {
        inflight.delete(key)
    }
}
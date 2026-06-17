/**
 * Graceful shutdown for SIGTERM and SIGINT.
 *
 * Container orchestrators (Kubernetes, Docker, Nomad) send SIGTERM
 * during rolling deploys and pod evictions; the process gets a small
 * grace period (default 30s in K8s) to finish in-flight work and
 * release connections cleanly before SIGKILL.
 *
 * Without this handler:
 *   - Mongo connections are torn down by the OS, leaving zombies on
 *     the server side until the cluster's idle timeout (~10 min).
 *   - Redis BullMQ workers don't get a chance to nack their currently-
 *     processed job, so the job is treated as completed when it wasn't.
 *   - The dashboard's Socket.IO clients see an abrupt RST instead of
 *     a clean close frame.
 *
 * With this handler all three close cleanly. The handler is registered
 * once by instrumentation.js when the Node runtime starts.
 *
 * Edge-runtime safety
 * ───────────────────
 * instrumentation.js runs in BOTH the Node and Edge runtimes (Next
 * bundles both even though only the Node branch reaches this module).
 * To keep ioredis (which transitively requires 'dns', 'net', 'tls')
 * out of the Edge bundle, we load mongoose + redis lazily inside the
 * shutdown handler via the eval('require') escape hatch. By the time
 * the handler fires, we're definitely in the Node runtime, so the
 * native loader can resolve them normally.
 */

let shutting = false

async function shutdownConnections() {
    // eval('require') hides the imports from webpack's static analyzer.
    // The strings are constants, the code path is Node-only — safe.
    const nodeRequire = eval('require')

    const mongoose = nodeRequire('mongoose')
    const { redis, bullmqRedis } = nodeRequire('./redis.js')

    const closers = []

    closers.push(
        mongoose.disconnect()
            .then(() => console.log('[shutdown] mongo: disconnected'))
            .catch(err => console.error('[shutdown] mongo error:', err.message))
    )

    closers.push(
        redis.quit()
            .then(() => console.log('[shutdown] redis: closed'))
            .catch(err => console.error('[shutdown] redis error:', err.message))
    )

    if (bullmqRedis && typeof bullmqRedis.quit === 'function') {
        closers.push(
            bullmqRedis.quit()
                .then(() => console.log('[shutdown] bullmq redis: closed'))
                .catch(err => console.error('[shutdown] bullmq redis error:', err.message))
        )
    }

    // Cap the wait at 5s. If anything takes longer (stuck in a Mongo
    // transaction, half-open Redis socket), we'd rather exit cleanly
    // than have the orchestrator kill us with SIGKILL.
    const timeout = new Promise(resolve => setTimeout(resolve, 5000))
    await Promise.race([Promise.allSettled(closers), timeout])
}

export async function gracefulShutdown(signal) {
    if (shutting) return
    shutting = true

    console.log(`[shutdown] received ${signal}, draining...`)

    try {
        await shutdownConnections()
    } catch (err) {
        console.error('[shutdown] unexpected error:', err.message)
    }

    console.log('[shutdown] complete, exiting')
    process.exit(0)
}

/**
 * V15 — register SIGTERM + SIGINT handlers ONCE per process.
 *
 * Safe to call multiple times; subsequent calls are no-ops.
 */
let registered = false
export function registerShutdownHandlers() {
    if (registered) return
    registered = true

    for (const sig of ['SIGTERM', 'SIGINT']) {
        process.once(sig, () => gracefulShutdown(sig))
    }
}

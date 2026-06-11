/**
 * SIEM sink — newline-delimited JSON (NDJSON) file appender for
 * downstream Wazuh / ELK / Splunk / generic SIEM ingestion.
 *
 * Why a file, not HTTP POST to the SIEM directly?
 * ───────────────────────────────────────────────
 * The Wazuh-native pattern is a JSON file on disk read by the wazuh-agent's
 * `<localfile><log_format>json</log_format>...</localfile>` block. Reasons:
 *
 *   - Survives SIEM/agent outages — the agent buffers and ships when back up.
 *   - Survives our app crashes — file persists across restarts.
 *   - Zero new network dependency on the hot path of admin actions.
 *   - Multi-SIEM portable — same file is consumable by filebeat, fluentd,
 *     vector, promtail, etc. without code changes.
 *   - Matches writeAudit()'s "never throw, never block the business action"
 *     contract — file writes are vastly more reliable than HTTP calls.
 *
 * Failure model
 * ─────────────
 *   - Initialization: if SIEM_AUDIT_PATH is set but the file/dir is
 *     unwritable, initSiemSink() throws. Operator misconfigurations should
 *     fail loudly (called from instrumentation.js at boot).
 *   - Runtime: if a write fails after the sink is open (disk full, etc.),
 *     log the error once per minute (avoid log spam) and continue. SIEM
 *     forwarding is best-effort observability, not authoritative storage —
 *     the Mongo write in writeAudit() is the source of truth.
 *
 * Concurrency
 * ───────────
 * Node's fs.createWriteStream with flag 'a' uses O_APPEND on POSIX, which
 * is atomic for writes ≤ PIPE_BUF (4096 bytes on Linux). Each emit() writes
 * a single < 4 KB JSON line, so multiple workers (PM2 cluster, BullMQ
 * worker) can safely share the same file without locking.
 *
 * Rotation
 * ────────
 * NOT handled in this module. Use logrotate(8) with copytruncate, or the
 * wazuh-agent's built-in rotation. See docs/SIEM.md.
 *
 * Edge-runtime safety
 * ───────────────────
 * `fs` and `path` are loaded via dynamic `await import()` inside the async
 * initSiemSink() — string literals would still be picked up by webpack's
 * static analysis, but we use a non-literal expression via String() to
 * defeat the analyzer. The Edge runtime never reaches this code path
 * because:
 *   1. middleware.js doesn't import lib/audit.js (or anything that does)
 *   2. instrumentation.js only calls initSiemSink() inside its
 *      `NEXT_RUNTIME === 'nodejs'` branch
 *
 * Two-phase init contract
 * ───────────────────────
 *   initSiemSink()  — async, called once at boot from instrumentation.js.
 *                     Opens the file, validates writability, caches the
 *                     stream. Throws on misconfig.
 *   getSiemSink()   — sync, called on every audit/apilog event. Returns
 *                     the cached sink or null. Never throws.
 *
 * If getSiemSink() is called before initSiemSink() AND SIEM_AUDIT_PATH is
 * set, the event is silently dropped and a one-time warning is logged.
 * This avoids the hot path doing async work on every request.
 */

let cachedSink = null
let initAttempted = false
let lastErrorAt = 0
let initWarningLogged = false
const ERROR_LOG_INTERVAL_MS = 60_000   // log at most one runtime failure per minute

/**
 * Boot-time initializer. Call once from instrumentation.js inside the
 * Node-runtime branch. Throws if SIEM_AUDIT_PATH is set but the
 * directory is unwritable.
 *
 * Safe to call multiple times — second+ calls are no-ops.
 */
export async function initSiemSink() {
    if (initAttempted) return cachedSink
    initAttempted = true

    const target = process.env.SIEM_AUDIT_PATH
    if (!target) {
        cachedSink = null
        return null
    }

    // The String() wrapper prevents webpack from treating these as static
    // imports and trying to bundle 'fs'/'path' into the Edge runtime bundle.
    // (Plain `await import('fs')` would be statically resolved by webpack.)
    const fsModule = String('fs')
    const pathModule = String('path')
    const fs = await import(fsModule)
    const path = await import(pathModule)

    // --- Boot-time validation: directory exists + writable ---
    const dir = path.dirname(target)
    try {
        fs.mkdirSync(dir, { recursive: true, mode: 0o750 })
        fs.accessSync(dir, fs.constants.W_OK)
    } catch (err) {
        throw new Error(
            `[siem] SIEM_AUDIT_PATH directory not writable: ${dir} (${err.message}). ` +
            `Either create it with permissions for the app user, or unset SIEM_AUDIT_PATH ` +
            `to disable SIEM forwarding.`
        )
    }

    // O_APPEND on POSIX → each write is atomic up to PIPE_BUF (4 KB).
    const stream = fs.createWriteStream(target, {
        flags: 'a',
        mode: 0o640,
        highWaterMark: 64 * 1024
    })

    stream.on('error', (err) => {
        const now = Date.now()
        if (now - lastErrorAt > ERROR_LOG_INTERVAL_MS) {
            console.error('[siem] write stream error:', err.message)
            lastErrorAt = now
        }
    })

    cachedSink = {
        emit(event) {
            if (!event || typeof event !== 'object') return
            try {
                // NDJSON: one event per line, terminated by '\n'.
                // Wazuh's <log_format>json</log_format> parser splits on newlines
                // and expects each line to be self-contained valid JSON.
                stream.write(JSON.stringify(event) + '\n')
            } catch (err) {
                const now = Date.now()
                if (now - lastErrorAt > ERROR_LOG_INTERVAL_MS) {
                    console.error('[siem] emit failed:', err.message)
                    lastErrorAt = now
                }
            }
        },
        close() {
            return new Promise((resolve) => {
                if (stream.destroyed) return resolve()
                stream.end(resolve)
            })
        }
    }

    return cachedSink
}

/**
 * Sync accessor for the hot path. Returns the cached sink (initialized at
 * boot by initSiemSink()) or null.
 *
 * Never throws. Never does I/O. Safe to call from any code path.
 */
export function getSiemSink() {
    if (cachedSink) return cachedSink

    // If SIEM_AUDIT_PATH is set but init was never called, warn once.
    // This shouldn't happen in normal operation (instrumentation.js calls
    // initSiemSink at boot), but if it does we want a clear signal.
    if (process.env.SIEM_AUDIT_PATH && !initAttempted && !initWarningLogged) {
        console.warn(
            '[siem] SIEM_AUDIT_PATH is set but initSiemSink() was never called. ' +
            'Events will be dropped. Ensure instrumentation.js is loaded.'
        )
        initWarningLogged = true
    }
    return null
}

/**
 * Test-only: reset cache so unit tests can re-derive the sink with a
 * different SIEM_AUDIT_PATH env. Not exported as part of the public API.
 */
export function _resetForTests() {
    if (cachedSink && cachedSink.close) {
        cachedSink.close().catch(() => {})
    }
    cachedSink = null
    initAttempted = false
    initWarningLogged = false
    lastErrorAt = 0
}

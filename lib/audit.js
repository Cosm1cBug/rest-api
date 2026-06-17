import AuditLog from '@/models/auditLog.js'
import { clientIp } from '@/lib/clientIp.js'
import { getSiemSink } from '@/lib/audit/siemSink.js'

const SENSITIVE_FIELDS = new Set([
    'password',
    'passwordHash',
    'keyHash',
    'keyId',
    'apiKey',
    'secret',
    'token',
    'tokenHash'
])

function sanitise(obj) {
    if (!obj || typeof obj !== 'object') return obj
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
        if (SENSITIVE_FIELDS.has(k)) {
            out[k] = '[REDACTED]'
        } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            out[k] = sanitise(v)
        } else {
            out[k] = v
        }
    }
    return out
}

/**
 * Extract the X-Request-Id header set by
 * middleware.js. Falls back to '' (not null) so the AuditLog.requestId
 * field stays non-sparse — its index then holds every row, which makes
 * "find audit events with no request context" queries efficient too.
 */
function extractRequestId(req) {
    if (!req?.headers?.get) return ''
    return req.headers.get('x-request-id') || ''
}

export async function writeAudit({
    req = null,
    actor,
    action,
    target = {},
    before = null,
    after = null
}) {
    try {
        if (!actor?.id || !action) {
            console.warn('[audit] missing actor.id or action; skipped')
            return
        }

        const ip = req ? clientIp(req) : 'unknown'
        const userAgent = req?.headers?.get?.('user-agent') || 'unknown'
        // Capture the request id so the audit row can be
        // joined with the apilog firehose + the SIEM stream.
        const requestId = extractRequestId(req)

        const sanitisedBefore = sanitise(before)
        const sanitisedAfter = sanitise(after)

        await AuditLog.create({
            actorId: actor.id,
            actorEmail: actor.email || actor.name || 'unknown',
            action,
            targetType: target.type || 'user',
            targetId: target.id || null,
            targetLabel: target.label || '',
            before: sanitisedBefore,
            after: sanitisedAfter,
            ip,
            userAgent: String(userAgent).slice(0, 512),
            requestId   // V15 item #8
        })

        // --- SIEM forwarding (best-effort, never blocks or throws) ---
        const sink = getSiemSink()
        if (sink) {
            sink.emit({
                _type: 'audit',
                '@timestamp': new Date().toISOString(),
                actor: {
                    id: String(actor.id),
                    email: actor.email || actor.name || 'unknown'
                },
                action,
                target: {
                    type: target.type || 'user',
                    id: target.id ? String(target.id) : null,
                    label: target.label || ''
                },
                before: sanitisedBefore,
                after: sanitisedAfter,
                source: {
                    ip,
                    userAgent: String(userAgent).slice(0, 512)
                },
                // Same field name on the SIEM side so Wazuh
                // rules can correlate audit events with the apilog stream
                // (which already includes http.request.id from V11).
                http: {
                    request: { id: requestId || null }
                }
            })
        }
    } catch (err) {
        // Never bubble up — the business action must succeed regardless of
        // whether the audit trail did. The Mongo write is the source of
        // truth for in-app audit log viewing; SIEM is best-effort.
        console.error('[audit] write failed:', err.message)
    }
}

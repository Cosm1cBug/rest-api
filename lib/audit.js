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
            userAgent: String(userAgent).slice(0, 512)
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

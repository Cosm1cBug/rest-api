import AuditLog from '@/models/auditLog.js'
import { clientIp } from '@/lib/clientIp.js'

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

        await AuditLog.create({
            actorId: actor.id,
            actorEmail: actor.email || actor.name || 'unknown',
            action,
            targetType: target.type || 'user',
            targetId: target.id || null,
            targetLabel: target.label || '',
            before: sanitise(before),
            after: sanitise(after),
            ip,
            userAgent: String(userAgent).slice(0, 512)
        })
    } catch (err) {
        // Never bubble up.
        console.error('[audit] write failed:', err.message)
    }
}

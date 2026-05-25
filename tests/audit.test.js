import { describe, it, expect, vi } from 'vitest'

/**
 * lib/audit.js depends on the AuditLog Mongoose model. We don't want
 * to spin up Mongo for unit tests, so we mock the model BEFORE
 * importing the module under test. This isolates the sanitise() logic
 * — the actual security guarantee — from the persistence layer.
 */

vi.mock('@/models/auditLog.js', () => ({
    default: {
        create: vi.fn().mockResolvedValue({})
    }
}))

vi.mock('@/lib/clientIp.js', () => ({
    clientIp: () => '203.0.113.5'
}))

const { writeAudit } = await import('../lib/audit.js')
const AuditLog = (await import('../models/auditLog.js')).default

describe('writeAudit sanitisation', () => {
    it('redacts password/keyHash/apiKey/token from before/after payloads', async () => {
        AuditLog.create.mockClear()

        await writeAudit({
            actor: { id: 'abc', email: 'admin@example.com' },
            action: 'user.update',
            target: { id: 'def', label: 'victim@example.com' },
            before: {
                role: 'basic',
                password: 'old-cleartext',
                keyHash: '$2a$12$...',
                apiKey: 'plaintext-key-leak'
            },
            after: {
                role: 'admin',
                token: 'should-never-end-up-in-logs',
                nested: {
                    secret: 'redact-me-too',
                    safe: 'keep-me'
                }
            }
        })

        expect(AuditLog.create).toHaveBeenCalledOnce()
        const row = AuditLog.create.mock.calls[0][0]

        // Non-sensitive fields preserved
        expect(row.before.role).toBe('basic')
        expect(row.after.role).toBe('admin')
        expect(row.after.nested.safe).toBe('keep-me')

        // All sensitive fields redacted, never the raw value
        expect(row.before.password).toBe('[REDACTED]')
        expect(row.before.keyHash).toBe('[REDACTED]')
        expect(row.before.apiKey).toBe('[REDACTED]')
        expect(row.after.token).toBe('[REDACTED]')
        expect(row.after.nested.secret).toBe('[REDACTED]')
    })

    it('NEVER throws even on persistence failure (audit must not break business actions)', async () => {
        AuditLog.create.mockRejectedValueOnce(new Error('mongo down'))

        await expect(writeAudit({
            actor: { id: 'abc', email: 'admin@x' },
            action: 'user.disable',
            target: { id: 'def' }
        })).resolves.toBeUndefined()
    })

    it('skips silently when actor.id is missing', async () => {
        AuditLog.create.mockClear()
        await writeAudit({ action: 'user.update', target: { id: 'd' } })
        expect(AuditLog.create).not.toHaveBeenCalled()
    })

    it('skips silently when action is missing', async () => {
        AuditLog.create.mockClear()
        await writeAudit({ actor: { id: 'a' }, target: { id: 'd' } })
        expect(AuditLog.create).not.toHaveBeenCalled()
    })
})

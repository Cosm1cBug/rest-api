/**
 * Integration test — V9-3 / writeAudit class.
 *
 * V9-3 was a bug where models/apiLog.js was missing a `requestId` field
 * that the writer (lib/metricsLogger.js) tried to set. Unit tests of the
 * writer module passed because they mocked the model — the writer's
 * .create() call resolved to a mocked Promise. In production, the field
 * was silently dropped by Mongoose's schema validation.
 *
 * This test exercises the writer + the real Mongoose model + the real
 * in-memory Mongo collection. Any future writer/schema drift will surface
 * here as a missing field on the queried document.
 *
 * Also asserts:
 *   - Sensitive fields (password, keyHash) are redacted by writeAudit's
 *     sanitiser before they reach the collection.
 *   - The audit collection is queryable by actorId AND by targetId
 *     (compound indexes from models/auditLog.js).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startTestEnv, stopTestEnv } from './setup.js'
import mongoose from 'mongoose'

let writeAudit, AuditLog

beforeAll(async () => {
    await startTestEnv()
    // Dynamic import AFTER the env is up, so models/* register against
    // the test connection.
    ;({ writeAudit } = await import('../../lib/audit.js'))
    AuditLog = (await import('../../models/auditLog.js')).default
})

afterAll(async () => {
    await stopTestEnv()
})

describe('writeAudit ↔ AuditLog (real Mongo, V9-3 regression class)', () => {

    it('writes an audit entry and the row contains every field the writer set', async () => {
        const actor = { id: new mongoose.Types.ObjectId(), email: 'admin@example.com' }
        const target = { type: 'user', id: new mongoose.Types.ObjectId(), label: 'alice@example.com' }

        await writeAudit({
            req: null,
            actor,
            action: 'user.disable',
            target,
            before: { disabled: false },
            after:  { disabled: true }
        })

        const row = await AuditLog.findOne({ actorId: actor.id }).lean()
        expect(row).toBeTruthy()
        expect(row.action).toBe('user.disable')
        expect(row.actorEmail).toBe('admin@example.com')
        expect(row.targetId.toString()).toBe(target.id.toString())
        expect(row.targetLabel).toBe('alice@example.com')
        expect(row.before).toEqual({ disabled: false })
        expect(row.after).toEqual({ disabled: true })
        expect(row.createdAt).toBeInstanceOf(Date)
    })

    it('redacts sensitive fields before persisting (V1 / V11 ethos)', async () => {
        const actor = { id: new mongoose.Types.ObjectId(), email: 'admin@example.com' }
        const target = { type: 'user', id: new mongoose.Types.ObjectId(), label: 'bob@example.com' }

        await writeAudit({
            req: null,
            actor,
            action: 'user.update',
            target,
            before: { username: 'bob', password: '$2a$12$realhash', keyHash: 'secret-bcrypt' },
            after:  { username: 'bob-v2', password: '$2a$12$newhash', keyHash: 'new-bcrypt' }
        })

        const row = await AuditLog.findOne({ action: 'user.update', actorId: actor.id }).lean()
        expect(row).toBeTruthy()
        // Username (non-sensitive) is preserved.
        expect(row.before.username).toBe('bob')
        expect(row.after.username).toBe('bob-v2')
        // Password and keyHash are REDACTED.
        expect(row.before.password).toBe('[REDACTED]')
        expect(row.after.password).toBe('[REDACTED]')
        expect(row.before.keyHash).toBe('[REDACTED]')
        expect(row.after.keyHash).toBe('[REDACTED]')
    })

    it('is queryable by targetId (regression: detail-page audit lookup)', async () => {
        // The /admin/users/[id] page (V13 item #1) queries the audit log by
        // targetId to show user-scoped history. Verify the compound index
        // works and the query returns the rows we wrote above.
        const targetIds = await AuditLog.distinct('targetId')
        expect(targetIds.length).toBeGreaterThanOrEqual(2)

        // Pick one of the earlier targets and assert we can fetch all
        // its entries.
        const sample = targetIds[0]
        const rows = await AuditLog.find({ targetId: sample }).lean()
        expect(rows.length).toBeGreaterThan(0)
        for (const r of rows) {
            expect(r.targetId.toString()).toBe(sample.toString())
        }
    })

    it('never throws even when the write itself fails (writeAudit contract)', async () => {
        // Simulate a write failure by temporarily breaking the model.
        // The contract is: writeAudit must not bubble — business actions
        // are not allowed to fail because audit failed.
        const originalCreate = AuditLog.create.bind(AuditLog)
        AuditLog.create = async () => { throw new Error('mongo down') }

        try {
            await expect(writeAudit({
                actor: { id: new mongoose.Types.ObjectId(), email: 'x@y.co' },
                action: 'user.test',
                target: { id: new mongoose.Types.ObjectId() }
            })).resolves.toBeUndefined()
        } finally {
            AuditLog.create = originalCreate
        }
    })
})

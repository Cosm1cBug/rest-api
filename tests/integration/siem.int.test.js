/**
 * Integration test — / SIEM sink end-to-end class.
 *
 * The V10-2.2 bug was: SIEM sink's webpack-bundled `fs` import resolved
 * fine in unit tests (vitest loader) but failed under Next.js's
 * bundled runtime — every audit event silently failed to reach the file.
 *
 * This test can't reproduce the *exact* webpack symptom (vitest also
 * isn't webpack), but it CAN verify the end-to-end contract:
 *   writeAudit() → AuditLog Mongo row PLUS one NDJSON line in the sink file.
 *
 * Future drift between the audit module and the sink (e.g. someone
 * renames the _type discriminator, drops a field, breaks NDJSON
 * formatting) surfaces as a failed assertion here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startTestEnv, stopTestEnv } from './setup.js'
import fs from 'fs'
import os from 'os'
import path from 'path'
import mongoose from 'mongoose'

let writeAudit
let AuditLog
let initSiemSink
let _resetSinkForTests
let sinkPath
let tmpDir

beforeAll(async () => {
    await startTestEnv()
    AuditLog = (await import('../../models/auditLog.js')).default
    // SIEM sink must be reset and pointed at a tmp file BEFORE the
    // audit module is imported (which would otherwise cache a null sink).
    ;({ initSiemSink, _resetForTests: _resetSinkForTests } = await import('../../lib/audit/siemSink.js'))
})

afterAll(async () => {
    if (_resetSinkForTests) _resetSinkForTests()
    if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
    await stopTestEnv()
})

beforeEach(async () => {
    // Fresh sink file per test.
    if (_resetSinkForTests) _resetSinkForTests()
    if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siem-int-'))
    sinkPath = path.join(tmpDir, 'audit.json')
    process.env.SIEM_AUDIT_PATH = sinkPath
    await initSiemSink()
    await AuditLog.deleteMany({})
    // Re-import writeAudit AFTER sink reset so its getSiemSink() call
    // resolves to the new singleton.
    const mod = await import('../../lib/audit.js?fresh=' + Date.now())
    writeAudit = mod.writeAudit
})

describe('writeAudit → Mongo AND SIEM file (V10-2.2 regression class)', () => {

    it('persists to both Mongo and the SIEM file on a single call', async () => {
        const actor = { id: new mongoose.Types.ObjectId(), email: 'admin@example.com' }
        const target = { type: 'user', id: new mongoose.Types.ObjectId(), label: 'alice@example.com' }

        await writeAudit({
            req: null,
            actor,
            action: 'user.disable',
            target,
            before: { disabled: false },
            after: { disabled: true }
        })

        // Allow the file write stream's microtask to flush.
        await new Promise(r => setTimeout(r, 50))

        // 1. Mongo got the row.
        const rows = await AuditLog.find({ actorId: actor.id }).lean()
        expect(rows).toHaveLength(1)
        expect(rows[0].action).toBe('user.disable')

        // 2. SIEM file got exactly one NDJSON line.
        const raw = fs.readFileSync(sinkPath, 'utf8')
        const lines = raw.split('\n').filter(Boolean)
        expect(lines).toHaveLength(1)

        // 3. The line is valid JSON with the V11 SIEM schema shape.
        const evt = JSON.parse(lines[0])
        expect(evt._type).toBe('audit')
        expect(evt.action).toBe('user.disable')
        expect(evt.actor.email).toBe('admin@example.com')
        expect(evt.target.label).toBe('alice@example.com')
        expect(evt.before).toEqual({ disabled: false })
        expect(evt.after).toEqual({ disabled: true })
        expect(typeof evt['@timestamp']).toBe('string')
        // @timestamp must be ISO-8601.
        expect(() => new Date(evt['@timestamp']).toISOString()).not.toThrow()
    })

    it('redacts sensitive fields in BOTH the Mongo row and the SIEM event', async () => {
        const actor = { id: new mongoose.Types.ObjectId(), email: 'admin@example.com' }
        await writeAudit({
            actor,
            action: 'user.update',
            target: { id: new mongoose.Types.ObjectId(), label: 'bob@example.com' },
            before: { password: '$2a$12$old' },
            after:  { password: '$2a$12$new' }
        })

        await new Promise(r => setTimeout(r, 50))

        const mongoRow = await AuditLog.findOne({ action: 'user.update', actorId: actor.id }).lean()
        expect(mongoRow.before.password).toBe('[REDACTED]')
        expect(mongoRow.after.password).toBe('[REDACTED]')

        const sinkLine = fs.readFileSync(sinkPath, 'utf8').trim().split('\n').pop()
        const evt = JSON.parse(sinkLine)
        expect(evt.before.password).toBe('[REDACTED]')
        expect(evt.after.password).toBe('[REDACTED]')
    })
})

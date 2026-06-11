import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { initSiemSink, getSiemSink, _resetForTests } from '../lib/audit/siemSink.js'

let tmpDir

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siemSink-'))
    delete process.env.SIEM_AUDIT_PATH
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('SIEM sink', () => {
    it('initSiemSink returns null when SIEM_AUDIT_PATH is unset (sink disabled, valid prod config)', async () => {
        expect(await initSiemSink()).toBeNull()
        expect(getSiemSink()).toBeNull()
    })

    it('initSiemSink returns null when SIEM_AUDIT_PATH is empty string', async () => {
        process.env.SIEM_AUDIT_PATH = ''
        expect(await initSiemSink()).toBeNull()
    })

    it('initSiemSink creates the target directory if missing (operator convenience)', async () => {
        const nested = path.join(tmpDir, 'nested', 'deep', 'audit.json')
        process.env.SIEM_AUDIT_PATH = nested
        const sink = await initSiemSink()
        expect(sink).not.toBeNull()
        expect(fs.existsSync(path.dirname(nested))).toBe(true)
    })

    it('initSiemSink throws a clear error if the parent directory is unwritable', async () => {
        if (process.platform === 'win32') return
        const ro = path.join(tmpDir, 'ro')
        fs.mkdirSync(ro)
        fs.chmodSync(ro, 0o500)   // r-x, no write

        process.env.SIEM_AUDIT_PATH = path.join(ro, 'sub', 'audit.json')
        // Skip the assertion if running as root (chmod is moot)
        try {
            fs.accessSync(ro, fs.constants.W_OK)
            return   // we're root; can't reproduce the failure
        } catch {
            // good, truly read-only
        }

        await expect(initSiemSink()).rejects.toThrow(/not writable/)
    })

    it('appends one JSON-per-line per emit() (NDJSON contract)', async () => {
        const target = path.join(tmpDir, 'audit.json')
        process.env.SIEM_AUDIT_PATH = target

        const sink = await initSiemSink()
        sink.emit({ _type: 'audit', action: 'user.disable', target: { id: 'abc' } })
        sink.emit({ _type: 'audit', action: 'user.enable',  target: { id: 'abc' } })
        await sink.close()

        const lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean)
        expect(lines).toHaveLength(2)
        const e1 = JSON.parse(lines[0])
        const e2 = JSON.parse(lines[1])
        expect(e1.action).toBe('user.disable')
        expect(e2.action).toBe('user.enable')
    })

    it('ignores non-object emits silently (defensive — never throw)', async () => {
        const target = path.join(tmpDir, 'audit.json')
        process.env.SIEM_AUDIT_PATH = target

        const sink = await initSiemSink()
        sink.emit(null)
        sink.emit(undefined)
        sink.emit('string-event')
        sink.emit(42)
        await sink.close()

        if (fs.existsSync(target)) {
            const data = fs.readFileSync(target, 'utf8')
            expect(data).toBe('')
        }
    })

    it('appends to an existing file rather than truncating (cross-restart survival)', async () => {
        const target = path.join(tmpDir, 'audit.json')
        fs.writeFileSync(target, '{"_type":"audit","action":"pre-existing"}\n')

        process.env.SIEM_AUDIT_PATH = target
        const sink = await initSiemSink()
        sink.emit({ _type: 'audit', action: 'new-event' })
        await sink.close()

        const lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean)
        expect(lines).toHaveLength(2)
        expect(JSON.parse(lines[0]).action).toBe('pre-existing')
        expect(JSON.parse(lines[1]).action).toBe('new-event')
    })

    it('caches the sink across getSiemSink() calls (one stream per process)', async () => {
        process.env.SIEM_AUDIT_PATH = path.join(tmpDir, 'audit.json')
        await initSiemSink()
        const a = getSiemSink()
        const b = getSiemSink()
        expect(a).toBe(b)
        expect(a).not.toBeNull()
    })

    it('getSiemSink returns null (does not throw) if init was never called', () => {
        // No SIEM_AUDIT_PATH, no init -> just returns null silently.
        expect(getSiemSink()).toBeNull()
    })
})

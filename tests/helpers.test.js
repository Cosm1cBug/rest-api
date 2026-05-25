import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clientIp } from '../lib/clientIp.js'
import { requireJson } from '../lib/auth/requireJson.js'
import { generateApiKey } from '../lib/auth/apiKeys.js'
import { checkAdminKey } from '../lib/auth/adminKey.js'

/**
 * Minimal mocks. NextAuth's `req.headers.get` is the only shape we need.
 */
function makeReq(headers = {}) {
    const lc = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    )
    return {
        headers: {
            get: (name) => lc[String(name).toLowerCase()] ?? null
        }
    }
}

// ---------------------------------------------------- clientIp
describe('clientIp', () => {
    const original = process.env.TRUSTED_PROXIES

    beforeEach(() => {
        delete process.env.TRUSTED_PROXIES
    })
    afterEach(() => {
        if (original === undefined) delete process.env.TRUSTED_PROXIES
        else process.env.TRUSTED_PROXIES = original
    })

    it('returns x-real-ip when present and valid', () => {
        expect(clientIp(makeReq({ 'x-real-ip': '203.0.113.5' }))).toBe('203.0.113.5')
    })

    it('IGNORES x-forwarded-for when TRUSTED_PROXIES is unset (V1-#17)', () => {
        // The spoof-resistant default: don't accept XFF from arbitrary hosts.
        const ip = clientIp(makeReq({ 'x-forwarded-for': '1.2.3.4' }))
        expect(ip.startsWith('anon:')).toBe(true)
    })

    it('honors x-forwarded-for when TRUSTED_PROXIES is set', () => {
        process.env.TRUSTED_PROXIES = '10.0.0.1'
        expect(clientIp(makeReq({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
    })

    it('falls back to a user-agent-derived anon bucket, never a shared "unknown"', () => {
        const a = clientIp(makeReq({ 'user-agent': 'curl/8.0' }))
        const b = clientIp(makeReq({ 'user-agent': 'wget/1.21' }))
        expect(a).not.toBe(b)
        // And never literally "unknown"
        expect(a).not.toBe('unknown')
    })
})

// ---------------------------------------------------- requireJson
describe('requireJson', () => {
    it('passes through application/json', () => {
        expect(requireJson(makeReq({ 'content-type': 'application/json' }))).toBeNull()
    })

    it('passes through application/json; charset=utf-8', () => {
        expect(requireJson(makeReq({ 'content-type': 'application/json; charset=utf-8' }))).toBeNull()
    })

    it('rejects form-encoded (the trivial CSRF carrier)', async () => {
        const res = requireJson(makeReq({ 'content-type': 'application/x-www-form-urlencoded' }))
        expect(res).not.toBeNull()
        expect(res.status).toBe(415)
    })

    it('rejects missing Content-Type', () => {
        const res = requireJson(makeReq({}))
        expect(res).not.toBeNull()
        expect(res.status).toBe(415)
    })
})

// ---------------------------------------------------- generateApiKey
describe('generateApiKey', () => {
    it('produces 16-hex keyId and 48-hex secret with a "." separator', async () => {
        const { keyId, keyHash, apiKey } = await generateApiKey()

        expect(keyId).toMatch(/^[a-f0-9]{16}$/)
        expect(apiKey).toMatch(/^[a-f0-9]{16}\.[a-f0-9]{48}$/)

        // bcrypt hashes start with $2 (a/b/y variant) and are 60 chars.
        expect(keyHash.startsWith('$2')).toBe(true)
        expect(keyHash.length).toBe(60)
    })

    it('every key is unique across many invocations (entropy check)', async () => {
        // bcrypt-12 is ~250ms each on a typical CI runner, so we keep N
        // small enough that the whole test stays comfortably under the
        // default 10s timeout while still exercising the random generator.
        const N = 8
        const set = new Set()
        for (let i = 0; i < N; i++) {
            const { keyId } = await generateApiKey()
            set.add(keyId)
        }
        expect(set.size).toBe(N)
    })
})

// ---------------------------------------------------- checkAdminKey
describe('checkAdminKey', () => {
    const original = process.env.ADMIN_KEY

    afterEach(() => {
        if (original === undefined) delete process.env.ADMIN_KEY
        else process.env.ADMIN_KEY = original
    })

    it('FAILS CLOSED when ADMIN_KEY is unset (V1-#15)', () => {
        delete process.env.ADMIN_KEY
        const res = checkAdminKey(makeReq({ 'x-admin-key': 'whatever' }))
        expect(res).not.toBeNull()
        expect(res.status).toBe(403)
    })

    it('FAILS CLOSED when ADMIN_KEY is too short', () => {
        process.env.ADMIN_KEY = 'short'
        const res = checkAdminKey(makeReq({ 'x-admin-key': 'short' }))
        expect(res).not.toBeNull()
        expect(res.status).toBe(403)
    })

    it('accepts the exact key when set to >=16 chars', () => {
        process.env.ADMIN_KEY = 'this-is-a-sufficiently-long-key-1234'
        const res = checkAdminKey(makeReq({ 'x-admin-key': process.env.ADMIN_KEY }))
        expect(res).toBeNull()
    })

    it('rejects same-length but different key', () => {
        process.env.ADMIN_KEY = 'this-is-a-sufficiently-long-key-1234'
        const wrong = 'x'.repeat(process.env.ADMIN_KEY.length)
        const res = checkAdminKey(makeReq({ 'x-admin-key': wrong }))
        expect(res).not.toBeNull()
    })

    it('rejects different-length key (no length-based timing leak)', () => {
        process.env.ADMIN_KEY = 'this-is-a-sufficiently-long-key-1234'
        const res = checkAdminKey(makeReq({ 'x-admin-key': 'short' }))
        expect(res).not.toBeNull()
    })
})

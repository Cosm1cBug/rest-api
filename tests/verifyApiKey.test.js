import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'

/**
 * Unit-test verifyApiKey() in isolation by mocking the Mongo models.
 *
 * Lock down the contract that matters most:
 *   1. Malformed keys fail BEFORE we touch Mongo.
 *   2. Expired keys fail BEFORE we run bcrypt (so they cost no CPU).
 *   3. Revoked keys are rejected.
 *   4. Scope check rejects when the key is missing the required scope.
 *   5. Empty scopes => full access (back-compat).
 *   6. Disabled accounts always rejected, regardless of key state.
 */

const findOneMock = vi.fn()
const updateOneMock = vi.fn().mockResolvedValue({})
const findByIdMock = vi.fn()
const userFindOneMock = vi.fn()

vi.mock('@/models/apiKey.js', () => ({
    default: {
        findOne: (...args) => ({ lean: () => findOneMock(...args) }),
        updateOne: (...args) => ({ catch: () => updateOneMock(...args) })
    }
}))

vi.mock('@/models/user.js', () => ({
    default: {
        findById: (...args) => findByIdMock(...args),
        findOne: (...args) => userFindOneMock(...args)
    }
}))

const { verifyApiKey } = await import('../lib/middleware/verifyApiKey.js')

// Use a real bcrypt hash so the success path actually returns true.
const SECRET = 'a'.repeat(48)                   // 48 hex chars
const KEY_ID = '0123456789abcdef'              // 16 hex chars
const PLAINTEXT = `${KEY_ID}.${SECRET}`
let HASH

beforeEach(async () => {
    HASH = await bcrypt.hash(SECRET, 4)         // low rounds for test speed
    findOneMock.mockReset()
    findByIdMock.mockReset()
    userFindOneMock.mockReset()
})

function makeReq(apiKey) {
    return {
        headers: {
            get: (n) => n.toLowerCase() === 'x-api-key' ? apiKey : null
        }
    }
}

describe('verifyApiKey — input validation', () => {
    it('rejects a missing header', async () => {
        await expect(verifyApiKey(makeReq(null))).rejects.toThrow(/Missing/)
    })

    it('rejects oversize input (bcrypt DoS guard)', async () => {
        await expect(verifyApiKey(makeReq('x'.repeat(300)))).rejects.toThrow(/Malformed/)
    })

    it('rejects malformed format BEFORE Mongo lookup', async () => {
        await expect(verifyApiKey(makeReq('nodot'))).rejects.toThrow(/Malformed/)
        await expect(verifyApiKey(makeReq('short.short'))).rejects.toThrow(/Malformed/)
        expect(findOneMock).not.toHaveBeenCalled()
    })
})

describe('verifyApiKey — new-style ApiKey', () => {
    it('rejects expired keys WITHOUT calling bcrypt', async () => {
        const bcryptSpy = vi.spyOn(bcrypt, 'compare')
        findOneMock.mockResolvedValueOnce({
            _id: 'k1', keyHash: HASH, userId: 'u1', revoked: false,
            scopes: [], expiresAt: new Date(Date.now() - 60_000)
        })
        await expect(verifyApiKey(makeReq(PLAINTEXT))).rejects.toThrow(/expired/i)
        expect(bcryptSpy).not.toHaveBeenCalled()
        bcryptSpy.mockRestore()
    })

    it('rejects revoked keys', async () => {
        findOneMock.mockResolvedValueOnce({
            _id: 'k1', keyHash: HASH, userId: 'u1', revoked: true,
            scopes: [], expiresAt: null
        })
        await expect(verifyApiKey(makeReq(PLAINTEXT))).rejects.toThrow(/Invalid/)
    })

    it('rejects when scope check fails', async () => {
        findOneMock.mockResolvedValueOnce({
            _id: 'k1', keyHash: HASH, userId: 'u1', revoked: false,
            scopes: ['uploads:read'], expiresAt: null
        })
        findByIdMock.mockResolvedValueOnce({ _id: 'u1', disabled: false })
        await expect(verifyApiKey(makeReq(PLAINTEXT), { scope: 'github' }))
            .rejects.toThrow(/scope/i)
    })

    it('allows when scope is present', async () => {
        findOneMock.mockResolvedValueOnce({
            _id: 'k1', keyHash: HASH, userId: 'u1', revoked: false,
            scopes: ['github'], expiresAt: null
        })
        findByIdMock.mockResolvedValueOnce({ _id: 'u1', disabled: false })
        const u = await verifyApiKey(makeReq(PLAINTEXT), { scope: 'github' })
        expect(u._id).toBe('u1')
    })

    it('allows when scopes is empty (back-compat full access)', async () => {
        findOneMock.mockResolvedValueOnce({
            _id: 'k1', keyHash: HASH, userId: 'u1', revoked: false,
            scopes: [], expiresAt: null
        })
        findByIdMock.mockResolvedValueOnce({ _id: 'u1', disabled: false })
        const u = await verifyApiKey(makeReq(PLAINTEXT), { scope: 'github' })
        expect(u._id).toBe('u1')
    })

    it('rejects when the owning account is disabled', async () => {
        findOneMock.mockResolvedValueOnce({
            _id: 'k1', keyHash: HASH, userId: 'u1', revoked: false,
            scopes: [], expiresAt: null
        })
        findByIdMock.mockResolvedValueOnce({ _id: 'u1', disabled: true })
        await expect(verifyApiKey(makeReq(PLAINTEXT))).rejects.toThrow(/disabled/i)
    })
})

describe('verifyApiKey — legacy fallback', () => {
    it('still works for users with inline keyId/keyHash and no ApiKey row', async () => {
        findOneMock.mockResolvedValueOnce(null)
        userFindOneMock.mockResolvedValueOnce({
            _id: 'u-legacy', keyId: KEY_ID, keyHash: HASH, disabled: false
        })
        const u = await verifyApiKey(makeReq(PLAINTEXT))
        expect(u._id).toBe('u-legacy')
    })
})

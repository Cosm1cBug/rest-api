import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Lock down the two-mode contract:
 *   - No admin key  → only { status, timestamp } (no `services` key)
 *   - With key      → adds { services: { mongodb, redis } }
 *
 * We mock mongoose + redis so these tests run without any real
 * database. The goal here is the SHAPE of the response, not the
 * status — both modes use the same health computation.
 */

vi.mock('mongoose', () => ({
    default: { connection: { readyState: 1 } }
}))

vi.mock('@/lib/redis.js', () => ({
    redis: {
        ping: vi.fn().mockResolvedValue('PONG')
    }
}))

const { GET } = await import('../app/api/health/route.js')

function makeReq(headers = {}) {
    return {
        headers: {
            get: (name) => headers[String(name).toLowerCase()] ?? null
        }
    }
}

describe('GET /api/health — response shape', () => {

    const originalKey = process.env.ADMIN_KEY

    beforeEach(() => {
        process.env.ADMIN_KEY = 'this-is-a-sufficiently-long-admin-key-1234'
    })
    afterEach(() => {
        if (originalKey === undefined) delete process.env.ADMIN_KEY
        else process.env.ADMIN_KEY = originalKey
    })

    it('returns minimal payload to anonymous callers (no services key)', async () => {
        const res = await GET(makeReq())
        const body = await res.json()

        expect(body).toHaveProperty('status')
        expect(body).toHaveProperty('timestamp')
        expect(body).not.toHaveProperty('services')   // ← critical
        expect(body).not.toHaveProperty('mongodb')
        expect(body).not.toHaveProperty('redis')
    })

    it('returns minimal payload when admin key is wrong', async () => {
        const res = await GET(makeReq({ 'x-admin-key': 'wrong-key-but-the-same-length-padding' }))
        const body = await res.json()

        expect(body).not.toHaveProperty('services')
    })

    it('adds services key when valid admin key is present', async () => {
        const res = await GET(makeReq({ 'x-admin-key': process.env.ADMIN_KEY }))
        const body = await res.json()

        expect(body).toHaveProperty('services')
        expect(body.services).toEqual({
            mongodb: 'connected',
            redis:   'connected'
        })
    })

    it('returns 200 when healthy', async () => {
        const res = await GET(makeReq())
        expect(res.status).toBe(200)
    })

    it('always sets Cache-Control: no-store', async () => {
        const res = await GET(makeReq())
        expect(res.headers.get('Cache-Control')).toBe('no-store')
    })
})

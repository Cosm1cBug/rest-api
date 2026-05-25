import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for lib/usage.js.
 *
 * We mock the User model so these run without Mongo. The goal here is
 * to lock down the rollover contract (request_today must reset on a
 * new UTC date) and the read-time projection (a stale persisted row
 * shows 0 if the date doesn't match).
 */

vi.mock('@/models/user.js', () => ({
    default: { updateOne: vi.fn().mockResolvedValue({}) }
}))

const { bumpUsage, readUsage, dailyQuotaFor, DAILY_QUOTA } = await import('../lib/usage.js')
const User = (await import('../models/user.js')).default

describe('readUsage', () => {
    const todayKey = new Date().toISOString().slice(0, 10)

    it('returns persisted today count when request_today_date matches today', () => {
        const r = readUsage({
            request_today: 42,
            request_today_date: todayKey,
            request_all: 1000
        })
        expect(r).toEqual({ requestToday: 42, requestAll: 1000 })
    })

    it('returns 0 today when request_today_date is from a previous day', () => {
        // The persisted value is yesterday's; readUsage projects it as 0
        // so the UI never shows a misleading stale count.
        const r = readUsage({
            request_today: 99,
            request_today_date: '2000-01-01',
            request_all: 5000
        })
        expect(r.requestToday).toBe(0)
        expect(r.requestAll).toBe(5000)
    })

    it('handles a brand-new account with no usage fields yet', () => {
        const r = readUsage({})
        expect(r).toEqual({ requestToday: 0, requestAll: 0 })
    })
})

describe('bumpUsage', () => {
    it('does nothing if userId is missing', async () => {
        User.updateOne.mockClear()
        await bumpUsage(null)
        await bumpUsage(undefined)
        await bumpUsage('')
        expect(User.updateOne).not.toHaveBeenCalled()
    })

    it('issues a single aggregation-pipeline update per call', async () => {
        User.updateOne.mockClear()
        await bumpUsage('user-id-123')
        expect(User.updateOne).toHaveBeenCalledOnce()

        const [filter, pipeline] = User.updateOne.mock.calls[0]
        expect(filter).toEqual({ _id: 'user-id-123' })
        // Must be an array (aggregation pipeline form), NOT a plain $set —
        // otherwise the conditional rollover is impossible.
        expect(Array.isArray(pipeline)).toBe(true)
    })

    it('NEVER throws even when Mongo is down (must not break request paths)', async () => {
        User.updateOne.mockRejectedValueOnce(new Error('mongo down'))
        await expect(bumpUsage('user-id-123')).resolves.toBeUndefined()
    })
})

describe('dailyQuotaFor', () => {
    it('returns the right number per role', () => {
        expect(dailyQuotaFor('basic')).toBe(DAILY_QUOTA.basic)
        expect(dailyQuotaFor('standard')).toBe(DAILY_QUOTA.standard)
        expect(dailyQuotaFor('premium')).toBe(DAILY_QUOTA.premium)
        expect(dailyQuotaFor('admin')).toBe(DAILY_QUOTA.admin)
    })

    it('falls back to "basic" (most restrictive) for unknown roles', () => {
        // Defends against a typo in role assignment accidentally granting
        // unlimited quota.
        expect(dailyQuotaFor('superuser')).toBe(DAILY_QUOTA.basic)
        expect(dailyQuotaFor(undefined)).toBe(DAILY_QUOTA.basic)
        expect(dailyQuotaFor(null)).toBe(DAILY_QUOTA.basic)
    })
})

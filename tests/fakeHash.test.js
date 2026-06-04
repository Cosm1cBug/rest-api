import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { getFakeHash } from '../lib/auth/fakeHash.js'

/**
 * The fake hash exists for ONE reason: to make the "no such user"
 * branch of authorize() take the same wall-clock time as the
 * "wrong password" branch, so an attacker can't tell which emails
 * are registered from response timing.
 *
 * The tests below lock down that contract:
 *   1. The returned value is a real bcrypt hash (compare won't blow up).
 *   2. compare() always returns false on it (so the fake-hash branch
 *      can never accidentally let a login through).
 *   3. Subsequent calls reuse the same hash (no bcrypt cost after boot).
 */

describe('getFakeHash', () => {
    it('returns a valid bcrypt hash', async () => {
        const h = await getFakeHash()
        // bcrypt v2 hashes are always 60 chars and start with $2a$, $2b$, or $2y$
        expect(h).toMatch(/^\$2[aby]\$\d{2}\$/)
        expect(h).toHaveLength(60)
    })

    it('returns the same promise on subsequent calls (cached, no bcrypt cost)', async () => {
        const h1 = await getFakeHash()
        const t0 = Date.now()
        const h2 = await getFakeHash()
        const dt = Date.now() - t0
        expect(h2).toBe(h1)
        // A real bcrypt(12) call takes ~250 ms. A cached read should be
        // basically instant. Allow a generous 50ms slop for CI jitter.
        expect(dt).toBeLessThan(50)
    })

    it('bcrypt.compare against the fake hash always returns false', async () => {
        const h = await getFakeHash()
        // The whole point: nothing the user could ever type matches.
        for (const guess of ['', 'admin', 'password', 'hunter2', 'a'.repeat(72)]) {
            const ok = await bcrypt.compare(guess, h)
            expect(ok, `compare('${guess}') should be false`).toBe(false)
        }
    })
})

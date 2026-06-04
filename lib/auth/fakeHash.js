import bcrypt from 'bcryptjs'

/**
 * Bcrypt hash of a random string, computed once at module load and
 * cached for the lifetime of the process.
 *
 * Why this file exists
 * ────────────────────
 * authorize() needs a "fake" bcrypt hash to compare against when the
 * caller's email does not match any user, so the wall-clock time of
 * the "no such user" response matches the "wrong password" response
 * (both pay one bcrypt.compare). Without this, an attacker measures
 * response time and learns which emails exist on the platform —
 * the classic enumeration leak.
 *
 * Previously this hash was supplied via FAKE_BCRYPT_HASH in .env.
 * That introduced a config burden, broke `npm run dev` for anyone who
 * forgot to set it, and ran headlong into the `$` escaping rules of
 * dotenv parsers (a bcrypt hash starts with `$2a$12$...`, which
 * triggers shell-style variable expansion in many implementations).
 *
 * Generating it at boot:
 *   ✓ One bcrypt(12) at startup — ~250 ms once, never again.
 *   ✓ Different value every restart, which is fine: it never gets
 *     compared against anything the user actually typed.
 *   ✓ Zero config — no env var to set, no `$` escaping, no
 *     forgotten-secret outage.
 *
 * Concurrency:
 *   The first call kicks off bcrypt.hash() and caches the *promise*.
 *   Any other concurrent first-time call awaits the same promise.
 *   No double work.
 */

const BCRYPT_ROUNDS = 12

let fakeHashPromise = null

/**
 * @returns {Promise<string>} a valid bcrypt hash, suitable as the
 *                            second argument to bcrypt.compare().
 */
export function getFakeHash() {
    if (!fakeHashPromise) {
        // The actual plaintext doesn't matter — nothing will ever be
        // compared against it equal-true. We just need bcrypt to spend
        // its usual ~250 ms doing the comparison.
        const plaintext =
            Math.random().toString(36) +
            Date.now().toString(36) +
            Math.random().toString(36)
        fakeHashPromise = bcrypt.hash(plaintext, BCRYPT_ROUNDS)
    }
    return fakeHashPromise
}
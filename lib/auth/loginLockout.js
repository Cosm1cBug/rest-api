import User from '@/models/user.js'

export const LOGIN_MAX_FAILS = 5
export const LOGIN_LOCK_MS = 15 * 60 * 1000   // 15 minutes

/**
 * @param {object} user — a Mongoose User document or a plain object that
 *                        has `lockUntil` and `_id`.
 * @returns {boolean}
 */
export function isLocked(user) {
    if (!user || !user.lockUntil) return false
    return new Date(user.lockUntil).getTime() > Date.now()
}

/**
 * Record a failed login attempt. Returns the updated state so callers
 * can decide what to log (we don't surface lock state to the user).
 *
 * @param {string} userId
 * @returns {Promise<{ attempts: number, locked: boolean }>}
 */
export async function recordLoginFailure(userId) {
    // Atomically increment. If this push tips us past the threshold,
    // set lockUntil in the same operation.
    const fresh = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { failedLoginAttempts: 1 } },
        { new: true, projection: { failedLoginAttempts: 1 } }
    ).lean()

    if (!fresh) return { attempts: 0, locked: false }

    if (fresh.failedLoginAttempts >= LOGIN_MAX_FAILS) {
        await User.updateOne(
            { _id: userId },
            { $set: { lockUntil: new Date(Date.now() + LOGIN_LOCK_MS) } }
        )
        return { attempts: fresh.failedLoginAttempts, locked: true }
    }

    return { attempts: fresh.failedLoginAttempts, locked: false }
}

/**
 * Wipe the failure counter & any lock. Called on successful login.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function clearLoginFailures(userId) {
    await User.updateOne(
        { _id: userId },
        { $set: { failedLoginAttempts: 0, lockUntil: null } }
    )
}

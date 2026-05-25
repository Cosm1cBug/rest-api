import User from '@/models/user.js'

function todayKeyUtc(now = new Date()) {
    return now.toISOString().slice(0, 10)
}

/**
 * Increment usage counters for one successful API request.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function bumpUsage(userId) {
    if (!userId) return

    const today = todayKeyUtc()

    try {
        await User.updateOne(
            { _id: userId },
            [
                {
                    $set: {
                        // request_today: if same day, +1; else reset to 1.
                        request_today: {
                            $cond: [
                                { $eq: ['$request_today_date', today] },
                                { $add: [{ $ifNull: ['$request_today', 0] }, 1] },
                                1
                            ]
                        },
                        request_today_date: today,
                        request_all: {
                            $add: [{ $ifNull: ['$request_all', 0] }, 1]
                        }
                    }
                }
            ]
        )
    } catch (err) {
        // Never fail the request because the counter couldn't be bumped.
        console.error('[usage] bumpUsage failed:', err.message)
    }
}

/**
 * Read the current counters, applying the same rollover logic in memory
 * for display purposes (the persisted value might be stale if the user
 * hasn't made a request yet today).
 *
 * @param {{ request_today?: number, request_today_date?: string, request_all?: number }} userDoc
 * @returns {{ requestToday: number, requestAll: number }}
 */
export function readUsage(userDoc = {}) {
    const today = todayKeyUtc()
    const requestToday = userDoc.request_today_date === today
        ? (userDoc.request_today || 0)
        : 0
    return {
        requestToday,
        requestAll: userDoc.request_all || 0
    }
}

/**
 * Daily request quota per role. Values are intentionally conservative
 * defaults; tune to taste. `admin` is effectively unlimited (large
 * sentinel value) — adjust if you want admins counted too.
 */
export const DAILY_QUOTA = {
    basic:    100,
    standard: 500,
    premium:  5000,
    admin:    1000000
}

/**
 * Look up the daily quota for a user's role. Falls back to the most
 * restrictive tier if the role is unknown so a misconfigured account
 * cannot accidentally be granted "unlimited" via a typo.
 *
 * @param {string} role
 * @returns {number}
 */
export function dailyQuotaFor(role) {
    return DAILY_QUOTA[role] ?? DAILY_QUOTA.basic
}

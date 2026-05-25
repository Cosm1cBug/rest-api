export const SCOPES = Object.freeze({
    GITHUB:  'github',         // /api/github/*
    UPLOADS: 'uploads:read'    // /api/uploads — read-only (no write endpoint exists yet)
})

/** Set of valid scope strings, used by the create-key validator. */
export const VALID_SCOPES = new Set(Object.values(SCOPES))

/**
 * Decide whether a key with `keyScopes` may exercise `required`.
 *
 *   - Empty `keyScopes` → full access (back-compat).
 *   - Otherwise `required` must be in the set.
 *
 * @param {string[]} keyScopes
 * @param {string}   required
 * @returns {boolean}
 */
export function hasScope(keyScopes, required) {
    if (!keyScopes || keyScopes.length === 0) return true
    if (!required) return true
    return keyScopes.includes(required)
}

/**
 * Validate + dedupe a user-supplied scopes array at key-creation time.
 * Returns null + an error message if any scope is unknown.
 *
 * @param {unknown} input
 * @returns {{ ok: true, scopes: string[] } | { ok: false, message: string }}
 */
export function normaliseScopes(input) {
    if (input === undefined || input === null) {
        return { ok: true, scopes: [] }
    }
    if (!Array.isArray(input)) {
        return { ok: false, message: 'scopes must be an array of strings' }
    }
    const out = []
    const seen = new Set()
    for (const raw of input) {
        if (typeof raw !== 'string') {
            return { ok: false, message: 'scopes must be strings' }
        }
        const s = raw.trim()
        if (!VALID_SCOPES.has(s)) {
            return { ok: false, message: `Unknown scope: ${s}` }
        }
        if (!seen.has(s)) {
            seen.add(s)
            out.push(s)
        }
    }
    return { ok: true, scopes: out }
}

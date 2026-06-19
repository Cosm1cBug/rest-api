/**
 * scope catalog.
 *
 * The original two scopes were endpoint-specific:
 *   - GITHUB  → /api/github/*
 *   - UPLOADS → /api/uploads
 *
 * V16 adds the 15-endpoint declarative scraper registry under
 * /api/scrape/[scraper]. Per-endpoint scopes would be 15 entries
 * (too granular), single global scope would be one (too coarse and
 * couples unrelated capabilities — a user who only wants weather
 * shouldn't have to grant access to crypto prices too).
 *
 * Category scopes are the middle ground. Seven categories cover all
 * 15 V16 endpoints; users can grant only the categories they need.
 *
 * Scope-string format
 * ───────────────────
 * Plain lowercase identifiers. Existing 'github' and 'uploads:read'
 * stay (back-compat with already-issued keys). New scopes are
 * single-word categories, not colon-namespaced — colons in scope
 * strings made V11 OAuth audit-log searches awkward, and we don't
 * need a verb component for read-only scrapers.
 *
 * Mapping from scope → which registry-entries it gates lives in
 * lib/scrapers/registry.js (each entry declares its `scope`). This
 * file is just the authoritative list of valid scope strings.
 */
export const SCOPES = Object.freeze({
    // Original
    GITHUB:        'github',         // /api/github/*
    UPLOADS:       'uploads:read',   // /api/uploads

    // category scopes for /api/scrape/*
    WEATHER:       'weather',        // open-meteo, sunrise-sunset
    GEOGRAPHY:     'geography',      // restcountries, nominatim, ipapi
    FINANCE:       'finance',        // coingecko, frankfurter
    NEWS:          'news',           // hackernews
    REFERENCE:     'reference',      // wikipedia, npm
    SCIENCE:       'science',        // spacex, usgs-earthquake
    UTILITIES:     'utilities'       // httpbin, dicebear, qrcode
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

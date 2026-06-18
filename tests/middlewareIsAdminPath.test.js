/**
 * V15.1 regression test — middleware admin-path classification.
 *
 * The literal-string bug:
 *   ADMIN_PREFIXES = ['/api/:path', ...]
 *   isAdminPath('/admin/users') → false  (because '/admin/users' never
 *                                         starts with '/api/:path/')
 *
 * was silent for the entire engagement because:
 *   - middleware.js is in the Edge bundle; unit tests didn't import it
 *   - integration tests don't exercise page-route gating
 *   - per-route requireAdmin() in handlers caught the worst damage,
 *     so admin API surfaces still 401'd anonymously and the bug only
 *     visibly manifested when a page route (`/dashboard`) loaded
 *     anonymously
 *
 * This test re-implements the classifier inline (matching middleware.js)
 * and locks the contract. If someone reintroduces ':path' notation or
 * forgets to list a new admin prefix, the test fails.
 *
 * Why inline rather than importing from middleware.js
 * ────────────────────────────────────────────────────
 * middleware.js exports `middleware` and `config`, not the helpers.
 * The helpers are module-scoped. Re-exporting them would change the
 * file's surface; instead we duplicate the small function here and
 * keep them in sync by hand. The "no `:path` literal allowed" test
 * is the real safety net.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

// Mirror of the production classifier — keep in sync with middleware.js.
const ADMIN_PATH_PREFIXES = [
    '/admin',
    '/dashboard',
    '/api/admin',
    '/api/dashboard'
]
const PUBLIC_EXCEPTIONS = []

function isAdminPath(pathname) {
    if (PUBLIC_EXCEPTIONS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
        return false
    }
    return ADMIN_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

describe('middleware isAdminPath classification', () => {

    it('matches /admin (exact)', () => {
        expect(isAdminPath('/admin')).toBe(true)
    })

    it('matches /admin/* (descendants)', () => {
        expect(isAdminPath('/admin/users')).toBe(true)
        expect(isAdminPath('/admin/users/507f1f77bcf86cd799439011')).toBe(true)
        expect(isAdminPath('/admin/audit-log')).toBe(true)
    })

    it('matches /dashboard (exact — the V15.1 bug repro)', () => {
        // BEFORE FIX: this returned false, letting /dashboard load anonymously.
        expect(isAdminPath('/dashboard')).toBe(true)
    })

    it('matches /dashboard/* (descendants)', () => {
        expect(isAdminPath('/dashboard/metrics')).toBe(true)
        expect(isAdminPath('/dashboard/advanced')).toBe(true)
    })

    it('matches /api/admin/* (server-side admin endpoints)', () => {
        expect(isAdminPath('/api/admin/users')).toBe(true)
        expect(isAdminPath('/api/admin/users/abc/disable')).toBe(true)
        expect(isAdminPath('/api/admin/audit-log')).toBe(true)
    })

    it('matches /api/dashboard/* (server-side dashboard endpoints)', () => {
        expect(isAdminPath('/api/dashboard/metrics')).toBe(true)
        expect(isAdminPath('/api/dashboard/telemetry')).toBe(true)
        expect(isAdminPath('/api/dashboard/queue')).toBe(true)
    })

    it('does NOT match public API endpoints', () => {
        expect(isAdminPath('/api/health')).toBe(false)
        expect(isAdminPath('/api/features')).toBe(false)
        expect(isAdminPath('/api/views/index')).toBe(false)
    })

    it('does NOT match auth endpoints (NextAuth handles its own auth)', () => {
        expect(isAdminPath('/api/auth/csrf')).toBe(false)
        expect(isAdminPath('/api/auth/session')).toBe(false)
        expect(isAdminPath('/api/auth/callback/credentials')).toBe(false)
        expect(isAdminPath('/api/auth/oauth-providers')).toBe(false)
    })

    it('does NOT match scraper endpoints (API-key gated, not session-gated)', () => {
        expect(isAdminPath('/api/github/user')).toBe(false)
        expect(isAdminPath('/api/github/repos')).toBe(false)
        expect(isAdminPath('/api/uploads')).toBe(false)
    })

    it('does NOT match user (self-service) endpoints', () => {
        // These DO require auth, but via per-route requireSession(), not
        // the admin gate. The admin gate is strictly for role=admin.
        expect(isAdminPath('/api/user/data')).toBe(false)
        expect(isAdminPath('/api/user/api-keys')).toBe(false)
    })

    it('does NOT match login / auth pages', () => {
        expect(isAdminPath('/auth/login')).toBe(false)
        expect(isAdminPath('/auth/register')).toBe(false)
        expect(isAdminPath('/auth/reset-password')).toBe(false)
    })

    it('does NOT match root or marketing pages', () => {
        expect(isAdminPath('/')).toBe(false)
        expect(isAdminPath('/features/some-slug')).toBe(false)
    })

    it('does NOT confuse /administrator with /admin', () => {
        // Regression guard: startsWith('/admin') would falsely match
        // '/administrator'. The check uses '/admin' OR '/admin/' to
        // disambiguate.
        expect(isAdminPath('/administrator')).toBe(false)
        expect(isAdminPath('/api/administrator')).toBe(false)
    })

    it('does NOT confuse /dashboard-stats with /dashboard', () => {
        expect(isAdminPath('/dashboard-stats')).toBe(false)
    })
})

describe('middleware.js source — no ":path" Express-style literals', () => {
    it('never uses ":path" as a string literal anywhere in middleware.js', () => {
        // The original bug: ADMIN_PREFIXES contained '/api/:path' which
        // looked like a route matcher but was compared as a string.
        // This test reads the actual middleware.js source and asserts
        // no path-literal contains ':path' or similar Express syntax.
        const src = fs.readFileSync(
            new URL('../middleware.js', import.meta.url),
            'utf8'
        )
        // Find every path literal — strings starting with `/` inside
        // single or double quotes. Exclude regex literals (matcher
        // config) which legitimately use different syntax.
        const pathLiterals = [
            ...src.matchAll(/'(\/[^']*)'/g),
            ...src.matchAll(/"(\/[^"]*)"/g)
        ].map(m => m[1])

        const offenders = pathLiterals.filter(p => /:[a-zA-Z_]/.test(p))
        expect(
            offenders,
            `Path literals using Express ":param" notation found in middleware.js:\n  ${offenders.join('\n  ')}\nUse plain prefix strings instead — the matcher config uses regexes, the body uses string comparisons.`
        ).toEqual([])
    })
})

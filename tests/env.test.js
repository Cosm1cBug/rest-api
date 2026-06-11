import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { assertSecrets } from '../lib/auth/env.js'

// Save/restore env so tests don't leak.
const originalEnv = { ...process.env }

let consoleErrorSpy

beforeEach(() => {
    // Clear all relevant vars; tests set what they need.
    for (const k of [
        'NEXTAUTH_SECRET', 'JWT_SECRET', 'ADMIN_KEY', 'ALLOWED_ORIGIN',
        'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
        'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'
    ]) {
        delete process.env[k]
    }
    // assertSecrets pushes per-problem messages to console.error before
    // throwing the generic "Refusing to start" — capture them so tests can
    // assert on the operator-facing detail.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    process.env = { ...originalEnv }
    consoleErrorSpy.mockRestore()
})

const STRONG = 'x'.repeat(32)

// Helper — collect every detail message console.error received.
function errorMessages() {
    return consoleErrorSpy.mock.calls.map(args => args.join(' '))
}

describe('assertSecrets — base secrets', () => {
    it('throws when NEXTAUTH_SECRET is missing', () => {
        process.env.JWT_SECRET = STRONG
        expect(() => assertSecrets({ inProduction: false })).toThrow(/insecure environment/)
        expect(errorMessages().join('\n')).toMatch(/NEXTAUTH_SECRET/)
    })

    it('throws when NEXTAUTH_SECRET is too short', () => {
        process.env.NEXTAUTH_SECRET = 'short'
        process.env.JWT_SECRET = STRONG
        expect(() => assertSecrets({ inProduction: false })).toThrow(/insecure environment/)
        expect(errorMessages().join('\n')).toMatch(/NEXTAUTH_SECRET.*32 characters/)
    })

    it('passes with both NEXTAUTH_SECRET and JWT_SECRET strong (dev mode)', () => {
        process.env.NEXTAUTH_SECRET = STRONG
        process.env.JWT_SECRET = STRONG
        expect(() => assertSecrets({ inProduction: false })).not.toThrow()
    })

    it('requires ADMIN_KEY and ALLOWED_ORIGIN in production', () => {
        process.env.NEXTAUTH_SECRET = STRONG
        process.env.JWT_SECRET = STRONG
        expect(() => assertSecrets({ inProduction: true })).toThrow(/insecure environment/)
        const msgs = errorMessages().join('\n')
        expect(msgs).toMatch(/ADMIN_KEY/)
        expect(msgs).toMatch(/ALLOWED_ORIGIN/)
    })

    it('passes in production with all required vars strong', () => {
        process.env.NEXTAUTH_SECRET = STRONG
        process.env.JWT_SECRET = STRONG
        process.env.ADMIN_KEY = STRONG
        process.env.ALLOWED_ORIGIN = 'https://example.com'
        expect(() => assertSecrets({ inProduction: true })).not.toThrow()
    })
})

describe('assertSecrets — V11 OAuth provider env pairs', () => {
    beforeEach(() => {
        process.env.NEXTAUTH_SECRET = STRONG
        process.env.JWT_SECRET = STRONG
    })

    it('passes when no OAuth providers are configured (opt-in contract)', () => {
        expect(() => assertSecrets({ inProduction: false })).not.toThrow()
        expect(errorMessages()).toEqual([])
    })

    it('passes when Google is fully configured', () => {
        process.env.GOOGLE_CLIENT_ID = 'goog-id-123'
        process.env.GOOGLE_CLIENT_SECRET = 'goog-secret'
        expect(() => assertSecrets({ inProduction: false })).not.toThrow()
    })

    it('throws when GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is missing', () => {
        process.env.GOOGLE_CLIENT_ID = 'goog-id-123'
        expect(() => assertSecrets({ inProduction: false })).toThrow(/insecure environment/)
        expect(errorMessages().join('\n')).toMatch(/GOOGLE_CLIENT_SECRET is missing/)
    })

    it('throws when GOOGLE_CLIENT_SECRET is set but GOOGLE_CLIENT_ID is missing', () => {
        process.env.GOOGLE_CLIENT_SECRET = 'goog-secret'
        expect(() => assertSecrets({ inProduction: false })).toThrow(/insecure environment/)
        expect(errorMessages().join('\n')).toMatch(/GOOGLE_CLIENT_ID is missing/)
    })

    it('throws when GITHUB_CLIENT_ID is set but GITHUB_CLIENT_SECRET is missing', () => {
        process.env.GITHUB_CLIENT_ID = 'gh-id-123'
        expect(() => assertSecrets({ inProduction: false })).toThrow(/insecure environment/)
        expect(errorMessages().join('\n')).toMatch(/GITHUB_CLIENT_SECRET is missing/)
    })

    it('passes with BOTH providers fully configured', () => {
        process.env.GOOGLE_CLIENT_ID = 'goog-id'
        process.env.GOOGLE_CLIENT_SECRET = 'goog-secret'
        process.env.GITHUB_CLIENT_ID = 'gh-id'
        process.env.GITHUB_CLIENT_SECRET = 'gh-secret'
        expect(() => assertSecrets({ inProduction: false })).not.toThrow()
    })

    it('error message tells the operator how to fix half-configured Google', () => {
        process.env.GOOGLE_CLIENT_ID = 'goog-id-123'
        expect(() => assertSecrets({ inProduction: false })).toThrow()
        expect(errorMessages().join('\n')).toMatch(/Either set both to enable Google sign-in, or unset both to disable it/)
    })
})

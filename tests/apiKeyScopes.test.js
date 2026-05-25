import { describe, it, expect } from 'vitest'
import {
    SCOPES,
    VALID_SCOPES,
    hasScope,
    normaliseScopes
} from '../lib/auth/apiKeyScopes.js'

describe('hasScope', () => {
    it('grants full access when keyScopes is empty (back-compat)', () => {
        expect(hasScope([], SCOPES.GITHUB)).toBe(true)
        expect(hasScope([], 'anything')).toBe(true)
        expect(hasScope(undefined, SCOPES.GITHUB)).toBe(true)
        expect(hasScope(null, SCOPES.GITHUB)).toBe(true)
    })

    it('allows when required scope is present', () => {
        expect(hasScope([SCOPES.GITHUB], SCOPES.GITHUB)).toBe(true)
        expect(hasScope([SCOPES.GITHUB, SCOPES.UPLOADS], SCOPES.GITHUB)).toBe(true)
    })

    it('denies when required scope is absent', () => {
        expect(hasScope([SCOPES.UPLOADS], SCOPES.GITHUB)).toBe(false)
        expect(hasScope(['random'], SCOPES.GITHUB)).toBe(false)
    })

    it('always allows when no scope is required', () => {
        expect(hasScope([SCOPES.GITHUB], null)).toBe(true)
        expect(hasScope([SCOPES.GITHUB], undefined)).toBe(true)
    })
})

describe('normaliseScopes', () => {
    it('treats undefined/null as empty (full access)', () => {
        expect(normaliseScopes(undefined)).toEqual({ ok: true, scopes: [] })
        expect(normaliseScopes(null)).toEqual({ ok: true, scopes: [] })
    })

    it('accepts a valid list and dedupes', () => {
        const r = normaliseScopes([SCOPES.GITHUB, SCOPES.GITHUB, SCOPES.UPLOADS])
        expect(r.ok).toBe(true)
        expect(r.scopes.sort()).toEqual([SCOPES.GITHUB, SCOPES.UPLOADS].sort())
    })

    it('rejects unknown scope names (typo guard)', () => {
        const r = normaliseScopes([SCOPES.GITHUB, 'admin:everything'])
        expect(r.ok).toBe(false)
        expect(r.message).toMatch(/Unknown scope/)
    })

    it('rejects non-array', () => {
        expect(normaliseScopes('github').ok).toBe(false)
        expect(normaliseScopes(42).ok).toBe(false)
        expect(normaliseScopes({ scope: 'x' }).ok).toBe(false)
    })

    it('rejects non-string items', () => {
        expect(normaliseScopes([42]).ok).toBe(false)
        expect(normaliseScopes([null]).ok).toBe(false)
    })

    it('VALID_SCOPES matches SCOPES values', () => {
        for (const v of Object.values(SCOPES)) {
            expect(VALID_SCOPES.has(v)).toBe(true)
        }
    })
})

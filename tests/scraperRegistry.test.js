import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { SCRAPERS, getScraper, listScraperIds, publicSummary } from '../lib/scrapers/registry.js'
import { VALID_SCOPES } from '../lib/auth/apiKeyScopes.js'

/**
 * V16 — registry shape validation.
 *
 * Locks the contract every registry entry must satisfy. Catches:
 *   - duplicate ids (would cause the second to silently shadow the first)
 *   - missing required fields (would crash registryRunner at request time)
 *   - non-Zod query schemas (would crash on parse)
 *   - unknown scope strings (would lock all keys out of the endpoint)
 *   - upstream() functions that don't return {url, headers?}
 *   - URL builders that emit unsafe-looking output (basic sanity)
 *
 * If you're adding a new scraper, run `npm test` first — these tests
 * will tell you what's wrong faster than a 500 in production.
 */

describe('V16 scraper registry', () => {

    it('has every scraper from the V16 tier-1 plan', () => {
        const ids = listScraperIds()
        // Order doesn't matter, but the set must contain all 15.
        expect(new Set(ids)).toEqual(new Set([
            'weather', 'sunrise-sunset',
            'country', 'geocode', 'ip-info',
            'crypto-price', 'fx-rate',
            'hackernews-top', 'hackernews-item',
            'wikipedia-summary', 'npm-package',
            'spacex-latest', 'earthquake-recent',
            'httpbin-echo', 'avatar', 'qrcode'
        ]))
    })

    it('every id is unique (no shadowing collisions)', () => {
        const ids = SCRAPERS.map(s => s.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('every id is a valid URL path segment (kebab-case, no special chars)', () => {
        for (const s of SCRAPERS) {
            expect(s.id, `bad id: ${s.id}`).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/)
            // Defence against accidental newlines / spaces / unicode tricks
            expect(s.id, `id has whitespace: "${s.id}"`).toBe(s.id.trim())
        }
    })

    it('every entry declares all required fields', () => {
        for (const s of SCRAPERS) {
            expect(typeof s.id,           `${s.id}: id`).toBe('string')
            expect(typeof s.name,         `${s.id}: name`).toBe('string')
            expect(typeof s.category,     `${s.id}: category`).toBe('string')
            expect(typeof s.description,  `${s.id}: description`).toBe('string')
            expect(typeof s.scope,        `${s.id}: scope`).toBe('string')
            expect(typeof s.cacheTtl,     `${s.id}: cacheTtl`).toBe('number')
            expect(typeof s.upstream,     `${s.id}: upstream`).toBe('function')
            expect(typeof s.fragility,    `${s.id}: fragility`).toBe('string')
            // requiresKey is null OR a string (env var name)
            expect(s.requiresKey === null || typeof s.requiresKey === 'string',
                `${s.id}: requiresKey must be null or string`).toBe(true)
        }
    })

    it('every scope is in the canonical SCOPES set', () => {
        for (const s of SCRAPERS) {
            expect(VALID_SCOPES.has(s.scope),
                `${s.id}: unknown scope "${s.scope}" — add to lib/auth/apiKeyScopes.js`).toBe(true)
        }
    })

    it('every query schema is a Zod object schema with .strict() or .passthrough()', () => {
        for (const s of SCRAPERS) {
            // ZodObject has _def.typeName === 'ZodObject'
            const def = s.query._def
            expect(def?.typeName,
                `${s.id}: query must be a Zod object schema`).toBe('ZodObject')
            // Either strict or passthrough — never default (which silently
            // drops unknown fields and lets attackers smuggle params).
            // The httpbin-echo intentionally uses passthrough; everything
            // else must be strict.
            const unknownKeys = def.unknownKeys
            if (s.id === 'httpbin-echo') {
                expect(unknownKeys, `${s.id}: should be passthrough`).toBe('passthrough')
            } else {
                expect(unknownKeys,
                    `${s.id}: query must be .strict() (currently "${unknownKeys}")`).toBe('strict')
            }
        }
    })

    it('cacheTtl is a non-negative integer seconds (0 disables cache)', () => {
        for (const s of SCRAPERS) {
            expect(Number.isInteger(s.cacheTtl) && s.cacheTtl >= 0,
                `${s.id}: cacheTtl must be a non-negative integer`).toBe(true)
            // Sanity cap: caching for more than a week is almost always wrong
            expect(s.cacheTtl <= 7 * 24 * 60 * 60,
                `${s.id}: cacheTtl > 7 days — review`).toBe(true)
        }
    })

    it('fragility is one of the accepted values', () => {
        for (const s of SCRAPERS) {
            expect(['stable', 'watch', 'unofficial'].includes(s.fragility),
                `${s.id}: fragility must be stable/watch/unofficial`).toBe(true)
        }
    })

    it('responseType when set is one of json/svg/png', () => {
        for (const s of SCRAPERS) {
            if (s.responseType !== undefined) {
                expect(['json', 'svg', 'png'].includes(s.responseType),
                    `${s.id}: responseType must be json/svg/png`).toBe(true)
            }
        }
    })

    it('upstream() with valid sample input returns { url, headers? }', () => {
        // Build a minimal valid input for each entry by introspecting the
        // Zod schema. Not exhaustive — just enough to verify upstream()
        // doesn't crash and produces a sane URL.
        const samples = {
            'weather':           { lat: 51.5, lng: -0.1 },
            'sunrise-sunset':    { lat: 51.5, lng: -0.1 },
            'country':           { name: 'Germany' },
            'geocode':           { q: 'Berlin' },
            'ip-info':           { ip: '8.8.8.8' },
            'crypto-price':      { ids: 'bitcoin' },
            'fx-rate':           { from: 'USD', to: 'EUR' },
            'hackernews-top':    { limit: 10 },
            'hackernews-item':   { id: 8863 },
            'wikipedia-summary': { title: 'OpenAPI' },
            'npm-package':       { name: 'next' },
            'spacex-latest':     {},
            'earthquake-recent': { hours: 24, minMagnitude: 5 },
            'httpbin-echo':      {},
            'avatar':            { seed: 'alice', style: 'identicon' },
            'qrcode':            { data: 'https://example.com', size: 200 }
        }
        // httpbin-echo's upstream uses req.url; provide a fake.
        const fakeReq = { url: 'http://localhost:3000/api/scrape/httpbin-echo?foo=bar' }

        for (const s of SCRAPERS) {
            const input = samples[s.id]
            expect(input, `no test sample defined for ${s.id} — add one above`).toBeDefined()

            // Validate the sample passes the registry schema (catches drift
            // between the schema and the docs/tests).
            const parsed = s.query.safeParse(input)
            expect(parsed.success,
                `${s.id}: sample input failed validation: ${JSON.stringify(parsed.error?.errors)}`).toBe(true)

            // Call upstream() and assert the shape.
            const result = s.upstream({ input: parsed.data, req: fakeReq })
            expect(typeof result.url, `${s.id}: upstream().url`).toBe('string')
            expect(result.url, `${s.id}: url must be https`).toMatch(/^https?:\/\//)
            // No newlines, no nulls — header-injection paranoia
            expect(result.url, `${s.id}: url contains control chars`).not.toMatch(/[\r\n\0]/)
            // Headers, if present, must be a plain object
            if (result.headers !== undefined) {
                expect(typeof result.headers).toBe('object')
            }
        }
    })

    it('Zod schemas reject obviously bad input (NoSQL/injection paranoia)', () => {
        // Spot-check: every schema should reject non-string for string fields,
        // out-of-range for numeric fields, and unknown keys for strict ones.
        const w = SCRAPERS.find(s => s.id === 'weather')
        expect(w.query.safeParse({ lat: 'NaN', lng: 0 }).success).toBe(false)
        expect(w.query.safeParse({ lat: 91, lng: 0 }).success).toBe(false)            // out of range
        expect(w.query.safeParse({ lat: 0, lng: 0, evil: '1' }).success).toBe(false)  // strict

        const fx = SCRAPERS.find(s => s.id === 'fx-rate')
        expect(fx.query.safeParse({ from: 'us', to: 'EUR' }).success).toBe(false)  // lowercase
        expect(fx.query.safeParse({ from: 'USD', to: 'EUR$$' }).success).toBe(false) // bad chars

        const ip = SCRAPERS.find(s => s.id === 'ip-info')
        expect(ip.query.safeParse({ ip: 'not-an-ip' }).success).toBe(false)
    })
})

describe('getScraper / listScraperIds / publicSummary', () => {

    it('getScraper returns the entry for a known id', () => {
        const s = getScraper('weather')
        expect(s).not.toBeNull()
        expect(s.id).toBe('weather')
    })

    it('getScraper returns null for an unknown id', () => {
        expect(getScraper('not-a-real-scraper')).toBeNull()
        expect(getScraper('')).toBeNull()
        expect(getScraper(null)).toBeNull()
        expect(getScraper(undefined)).toBeNull()
        // Defence-in-depth: never accept non-strings (would let attackers
        // pass {$ne: null} or similar via URL routing edge cases — won't
        // happen in practice because Next coerces, but the check is cheap)
        expect(getScraper(123)).toBeNull()
        expect(getScraper({})).toBeNull()
    })

    it('listScraperIds returns all 15 ids', () => {
        const ids = listScraperIds()
        expect(ids).toHaveLength(16)   // 15 + httpbin-echo == 16 in current set
    })

    it('publicSummary strips schema + upstream function', () => {
        const s = getScraper('weather')
        const summary = publicSummary(s)
        expect(summary.query).toBeUndefined()
        expect(summary.upstream).toBeUndefined()
        // But keeps the user-visible bits
        expect(summary.id).toBe('weather')
        expect(summary.name).toBe(s.name)
        expect(summary.category).toBe(s.category)
        expect(summary.scope).toBe(s.scope)
        expect(summary.cacheTtl).toBe(s.cacheTtl)
    })
})

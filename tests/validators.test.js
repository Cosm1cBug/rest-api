import { describe, it, expect } from 'vitest'
import { loginSchema, registerSchema } from '../lib/validators/auth.js'
import { adminUserPatchSchema, adminUserListQuerySchema } from '../lib/validators/admin.js'
import { userUpdateSchema } from '../lib/validators/user.js'
import {
    githubUserQuerySchema,
    githubReposQuerySchema,
    githubRepoQuerySchema
} from '../lib/validators/github.js'

// ------------- loginSchema
describe('loginSchema', () => {
    it('accepts a normal email + password', () => {
        // The schema validates email shape BEFORE trim/lowercase, so we
        // pass a clean input. The downstream toLowerCase ensures the
        // Mongo query is case-insensitive against the unique index.
        const r = loginSchema.safeParse({ email: 'Foo@Example.com', password: 'secret123' })
        expect(r.success).toBe(true)
        expect(r.data.email).toBe('foo@example.com')
    })

    it('rejects email with surrounding whitespace (clients must send clean input)', () => {
        const r = loginSchema.safeParse({ email: '  foo@example.com  ', password: 'secret123' })
        expect(r.success).toBe(false)
    })

    it('rejects NoSQL operator payloads (the V1-#6 attack)', () => {
        const r = loginSchema.safeParse({ email: { $gt: '' }, password: 'x' })
        expect(r.success).toBe(false)
    })

    it('rejects non-string email types', () => {
        for (const bad of [123, null, undefined, [], {}, true]) {
            expect(loginSchema.safeParse({ email: bad, password: 'secret123' }).success).toBe(false)
        }
    })

    it('rejects invalid email shape', () => {
        expect(loginSchema.safeParse({ email: 'not-an-email', password: 'secret123' }).success).toBe(false)
    })

    it('rejects oversized email (DoS guard)', () => {
        const huge = 'a'.repeat(300) + '@x.com'
        expect(loginSchema.safeParse({ email: huge, password: 'secret123' }).success).toBe(false)
    })

    // V10-1 regression — schema must be .strict() so a future refactor that does
    // User.findOne(parsed.data) or similar cannot smuggle extra fields like
    // { role: 'admin' } through the auth layer.
    it('rejects unknown fields (.strict() — V10-1 regression)', () => {
        expect(loginSchema.safeParse({
            email: 'foo@example.com',
            password: 'secret123',
            role: 'admin'
        }).success).toBe(false)
    })
})

// ----------------------------------------------------- registerSchema
describe('registerSchema', () => {
    it('accepts a normal registration', () => {
        const r = registerSchema.safeParse({
            username: 'alice',
            email: 'alice@example.com',
            password: 'longenough'
        })
        expect(r.success).toBe(true)
    })

    it('rejects exotic-character usernames (URL/log poisoning)', () => {
        for (const bad of ['alice bob', 'alice/etc', 'alice<script>', 'alice%20']) {
            expect(registerSchema.safeParse({
                username: bad, email: 'a@b.co', password: 'longenough'
            }).success).toBe(false)
        }
    })

    it('rejects short passwords', () => {
        expect(registerSchema.safeParse({
            username: 'alice', email: 'a@b.co', password: 'short'
        }).success).toBe(false)
    })

    // V10-1 regression — registration is a write path; unknown fields must be
    // rejected so an attacker cannot ship { role: 'admin' } through verify-otp.
    it('rejects unknown fields (.strict() — V10-1 regression)', () => {
        for (const sneak of [
            { username: 'alice', email: 'a@b.co', password: 'longenough', role: 'admin' },
            { username: 'alice', email: 'a@b.co', password: 'longenough', isAdmin: true },
            { username: 'alice', email: 'a@b.co', password: 'longenough', disabled: false },
            { username: 'alice', email: 'a@b.co', password: 'longenough', keyHash: 'x' }
        ]) {
            expect(
                registerSchema.safeParse(sneak).success,
                `should reject ${JSON.stringify(sneak)}`
            ).toBe(false)
        }
    })
})

// ----------------------------------------------- adminUserPatchSchema
describe('adminUserPatchSchema (privilege-escalation guard)', () => {
    it('accepts a role change', () => {
        expect(adminUserPatchSchema.safeParse({ role: 'admin' }).success).toBe(true)
    })

    it('rejects an empty body', () => {
        expect(adminUserPatchSchema.safeParse({}).success).toBe(false)
    })

    it('rejects unknown fields (no smuggling password/keyHash/etc.)', () => {
        // This is the core guarantee: an attacker (or buggy admin UI) cannot
        // include unexpected fields that the route would otherwise apply.
        for (const sneak of [
            { role: 'admin', password: 'new' },
            { role: 'admin', keyHash: 'fake' },
            { role: 'admin', _id: 'somethingelse' },
            { role: 'admin', email: 'attacker@evil.com' }
        ]) {
            expect(
                adminUserPatchSchema.safeParse(sneak).success,
                `should reject ${JSON.stringify(sneak)}`
            ).toBe(false)
        }
    })

    it('rejects invalid roles', () => {
        expect(adminUserPatchSchema.safeParse({ role: 'superuser' }).success).toBe(false)
    })
})

// ------------------------------------------- adminUserListQuerySchema
describe('adminUserListQuerySchema', () => {
    it('coerces page/limit strings to numbers', () => {
        const r = adminUserListQuerySchema.safeParse({ page: '3', limit: '50' })
        expect(r.success).toBe(true)
        expect(r.data.page).toBe(3)
        expect(r.data.limit).toBe(50)
    })

    it('caps limit at 100 to prevent giant scans', () => {
        expect(adminUserListQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
    })

    it('rejects unknown query params', () => {
        expect(adminUserListQuerySchema.safeParse({ sort: 'name' }).success).toBe(false)
    })
})

// ------------------------------------------------------ userUpdateSchema
describe('userUpdateSchema (self-edit guard)', () => {
    it('accepts a username change', () => {
        expect(userUpdateSchema.safeParse({ username: 'new-name' }).success).toBe(true)
    })

    it('rejects role smuggling (regression: user must not self-promote)', () => {
        // /api/user/update is where a user could try to set { role: "admin" }
        // on themselves. The strict schema makes this impossible at the
        // parse step.
        expect(userUpdateSchema.safeParse({ role: 'admin' }).success).toBe(false)
        expect(userUpdateSchema.safeParse({ username: 'ok', role: 'admin' }).success).toBe(false)
        expect(userUpdateSchema.safeParse({ disabled: false }).success).toBe(false)
        expect(userUpdateSchema.safeParse({ password: 'new' }).success).toBe(false)
        expect(userUpdateSchema.safeParse({ keyHash: 'x' }).success).toBe(false)
    })

    it('rejects external-URL image (avatar tracking guard)', () => {
        expect(userUpdateSchema.safeParse({ image: 'https://evil.com/track.png' }).success).toBe(false)
    })
})

// -------------------------------------------------------- github validators
describe('github query validators', () => {
    it('accepts canonical GitHub usernames', () => {
        for (const ok of ['octocat', 'a', 'a-b-c', 'Tom-Hanks']) {
            expect(githubUserQuerySchema.safeParse({ username: ok }).success).toBe(true)
        }
    })

    it('rejects usernames with traversal / metacharacters (the V1-#10 class)', () => {
        for (const bad of ['../etc/passwd', 'a/b', 'a..b', '*', 'a b', '${env}', 'a-', '-a']) {
            expect(
                githubUserQuerySchema.safeParse({ username: bad }).success,
                `should reject ${bad}`
            ).toBe(false)
        }
    })

    it('caps perPage at 100', () => {
        expect(githubReposQuerySchema.safeParse({
            username: 'octocat', perPage: '500'
        }).success).toBe(false)
    })

    it('rejects unknown sort values', () => {
        expect(githubReposQuerySchema.safeParse({
            username: 'octocat', sort: 'random'
        }).success).toBe(false)
    })

    it('repo query validates owner and name independently', () => {
        expect(githubRepoQuerySchema.safeParse({ owner: 'octocat', name: 'Hello-World' }).success).toBe(true)
        expect(githubRepoQuerySchema.safeParse({ owner: 'a/b', name: 'Hello' }).success).toBe(false)
        expect(githubRepoQuerySchema.safeParse({ owner: 'octocat', name: '../etc' }).success).toBe(false)
    })
})

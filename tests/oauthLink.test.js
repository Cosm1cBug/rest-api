import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Mongoose User model + issueApiKey BEFORE importing the module
// under test, so the module picks up our stubs instead of trying to reach
// a real Mongo connection.
const userStore = {
    docs: [],
    nextId: 1
}

function makeId() {
    // Minimal ObjectId-like stand-in. The string is baked at creation —
    // earlier version used `() => \`mock-id-${nextId++}\`` which incremented
    // on every .toString() call and made queries non-deterministic.
    const id = `mock-id-${userStore.nextId++}`
    return { toString: () => id }
}

vi.mock('@/models/user.js', () => ({
    default: {
        findOne: vi.fn(async (query) => {
            return userStore.docs.find(d => {
                if (query.email) return d.email === query.email
                // oauthProfile.<provider> query
                const providerKey = Object.keys(query).find(k => k.startsWith('oauthProfile.'))
                if (providerKey) {
                    const provider = providerKey.split('.')[1]
                    return d.oauthProfile?.[provider] === query[providerKey]
                }
                return false
            }) || null
        }),
        exists: vi.fn(async (query) => {
            return userStore.docs.some(d => d.username === query.username) || null
        }),
        create: vi.fn(async (doc) => {
            // Simulate unique index on email/username
            if (userStore.docs.some(d => d.email === doc.email)) {
                const err = new Error('duplicate email')
                err.code = 11000
                throw err
            }
            if (userStore.docs.some(d => d.username === doc.username)) {
                const err = new Error('duplicate username')
                err.code = 11000
                throw err
            }
            const created = { ...doc, _id: makeId() }
            userStore.docs.push(created)
            return created
        }),
        findOneAndUpdate: vi.fn(async (query, update) => {
            const queryIdStr = query._id?.toString?.() ?? String(query._id)
            const doc = userStore.docs.find(d => d._id?.toString?.() === queryIdStr)
            if (!doc) return null
            if (update.$addToSet?.oauthProviders) {
                doc.oauthProviders = doc.oauthProviders || []
                if (!doc.oauthProviders.includes(update.$addToSet.oauthProviders)) {
                    doc.oauthProviders.push(update.$addToSet.oauthProviders)
                }
            }
            if (update.$set) {
                for (const [k, v] of Object.entries(update.$set)) {
                    if (k.startsWith('oauthProfile.')) {
                        const provider = k.split('.')[1]
                        doc.oauthProfile = doc.oauthProfile || {}
                        doc.oauthProfile[provider] = v
                    } else {
                        doc[k] = v
                    }
                }
            }
            return doc
        })
    }
}))

vi.mock('@/lib/auth/apiKeys.js', () => ({
    issueApiKey: vi.fn(async () => ({ apiKey: 'mock.key', keyId: 'mock' }))
}))

// NOW import the module under test
const { resolveOAuthSignIn, providerVerifiedEmail } = await import('../lib/auth/oauthLink.js')

beforeEach(() => {
    userStore.docs = []
    userStore.nextId = 1
    vi.clearAllMocks()
})

describe('providerVerifiedEmail', () => {
    it('trusts Google email_verified=true', () => {
        expect(providerVerifiedEmail('google', { email: 'a@b.co', email_verified: true })).toBe(true)
    })

    it('rejects Google email_verified=false', () => {
        expect(providerVerifiedEmail('google', { email: 'a@b.co', email_verified: false })).toBe(false)
    })

    it('rejects Google when email_verified is missing (Workspace edge case)', () => {
        expect(providerVerifiedEmail('google', { email: 'a@b.co' })).toBe(false)
    })

    it('trusts GitHub email being present (NextAuth fetches verified-only)', () => {
        expect(providerVerifiedEmail('github', { email: 'a@b.co' })).toBe(true)
    })

    it('rejects GitHub when no email returned', () => {
        expect(providerVerifiedEmail('github', {})).toBe(false)
    })

    it('rejects unknown providers (fail closed)', () => {
        expect(providerVerifiedEmail('unknown', { email: 'a@b.co', email_verified: true })).toBe(false)
    })
})

describe('resolveOAuthSignIn — Path 1: existing-link', () => {
    it('signs in an existing user whose oauthProfile already maps this provider', async () => {
        userStore.docs.push({
            _id: makeId(),
            email: 'alice@example.com',
            username: 'alice',
            oauthProviders: ['google'],
            oauthProfile: { google: '109876543210' },
            disabled: false
        })

        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'alice@example.com', email_verified: true }
        })

        expect(r.allow).toBe(true)
        expect(r.action).toBe('signin')
        expect(r.user.email).toBe('alice@example.com')
    })

    it('rejects an existing-link user who has been disabled', async () => {
        userStore.docs.push({
            _id: makeId(),
            email: 'alice@example.com',
            username: 'alice',
            oauthProfile: { google: '109876543210' },
            disabled: true
        })

        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'alice@example.com', email_verified: true }
        })

        expect(r.allow).toBe(false)
        expect(r.action).toBe('reject')
        expect(r.reason).toBe('account-disabled')
    })
})

describe('resolveOAuthSignIn — Path 2: link by verified email', () => {
    it('links a new provider to an existing email-OTP user', async () => {
        userStore.docs.push({
            _id: makeId(),
            email: 'alice@example.com',
            username: 'alice',
            password: '$2a$12$hashhash',
            oauthProviders: [],
            oauthProfile: {},
            disabled: false
        })

        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'alice@example.com', email_verified: true }
        })

        expect(r.allow).toBe(true)
        expect(r.action).toBe('link')
        expect(r.user.oauthProviders).toContain('google')
        expect(r.user.oauthProfile.google).toBe('109876543210')
    })

    it('refuses to link when the provider says email_verified=false', async () => {
        userStore.docs.push({
            _id: makeId(),
            email: 'alice@example.com',
            username: 'alice',
            oauthProviders: [],
            oauthProfile: {},
            disabled: false
        })

        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'alice@example.com', email_verified: false }
        })

        expect(r.allow).toBe(false)
        expect(r.reason).toBe('provider-email-unverified')
    })

    it('refuses to link to a disabled account', async () => {
        userStore.docs.push({
            _id: makeId(),
            email: 'alice@example.com',
            username: 'alice',
            oauthProviders: [],
            oauthProfile: {},
            disabled: true
        })

        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'alice@example.com', email_verified: true }
        })

        expect(r.allow).toBe(false)
        expect(r.reason).toBe('account-disabled')
    })
})

describe('resolveOAuthSignIn — Path 3: create new user', () => {
    it('creates a brand new user when no email match exists', async () => {
        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'new@example.com', email_verified: true, picture: 'https://x/y.png' }
        })

        expect(r.allow).toBe(true)
        expect(r.action).toBe('create')
        expect(r.user.email).toBe('new@example.com')
        expect(r.user.oauthProviders).toEqual(['google'])
        expect(r.user.oauthProfile.google).toBe('109876543210')
        expect(r.user.role).toBe('basic')
        expect(r.user.username).toMatch(/^new-[a-f0-9]{8}$/)
        expect(r.user.image).toBe('https://x/y.png')
    })

    it('refuses to create when provider email is unverified', async () => {
        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'new@example.com', email_verified: false }
        })

        expect(r.allow).toBe(false)
        expect(r.reason).toBe('provider-email-unverified')
    })

    it('sanitizes weird email-local-part characters in the generated username', async () => {
        const r = await resolveOAuthSignIn({
            provider: 'github',
            providerAccountId: '12345',
            profile: { email: 'has spaces+plus@example.com' }
        })

        // GitHub path: provider verifies email if present (NextAuth-side check).
        expect(r.allow).toBe(true)
        expect(r.action).toBe('create')
        // Spaces and + are stripped; suffix appended.
        expect(r.user.username).toMatch(/^hasspacesplus-[a-f0-9]{8}$/)
    })

    it('falls back to "user" prefix when email local part has nothing usable', async () => {
        const r = await resolveOAuthSignIn({
            provider: 'github',
            providerAccountId: '999',
            profile: { email: '!!!@example.com' }
        })

        expect(r.allow).toBe(true)
        expect(r.user.username).toMatch(/^user-[a-f0-9]{8}$/)
    })
})

describe('resolveOAuthSignIn — sanity checks', () => {
    it('rejects when provider is missing', async () => {
        const r = await resolveOAuthSignIn({ providerAccountId: '1', profile: { email: 'a@b.co' } })
        expect(r.allow).toBe(false)
        expect(r.reason).toBe('missing-provider-id')
    })

    it('rejects when providerAccountId is missing', async () => {
        const r = await resolveOAuthSignIn({ provider: 'google', profile: { email: 'a@b.co' } })
        expect(r.allow).toBe(false)
        expect(r.reason).toBe('missing-provider-id')
    })

    it('rejects when no email is in the profile', async () => {
        const r = await resolveOAuthSignIn({ provider: 'google', providerAccountId: '1', profile: {} })
        expect(r.allow).toBe(false)
        expect(r.reason).toBe('no-email')
    })

    it('normalises email to lowercase before lookup', async () => {
        userStore.docs.push({
            _id: makeId(),
            email: 'alice@example.com',
            username: 'alice',
            oauthProviders: [],
            oauthProfile: {},
            disabled: false
        })

        const r = await resolveOAuthSignIn({
            provider: 'google',
            providerAccountId: '109876543210',
            profile: { email: 'ALICE@EXAMPLE.COM', email_verified: true }
        })

        expect(r.allow).toBe(true)
        expect(r.action).toBe('link')   // matched existing alice via case-insensitive email
    })
})

import * as CredentialsProviderModule from 'next-auth/providers/credentials'

const CredentialsProvider =
    CredentialsProviderModule.default?.default
    || CredentialsProviderModule.default
    || CredentialsProviderModule
import bcrypt from 'bcryptjs'
import User from '@/models/user.js'
import connectDB from '@/lib/mongodb.js'
import { loginSchema } from '@/lib/validators/auth.js'
import { consumeLoginLimit } from '@/lib/auth/loginRateLimit.js'
import {
    isLocked,
    recordLoginFailure,
    clearLoginFailures
} from '@/lib/auth/loginLockout.js'
import { clientIp } from '@/lib/clientIp.js'
import { getFakeHash } from '@/lib/auth/fakeHash.js'
import { buildOAuthProviders } from '@/lib/auth/oauthProviders.js'
import { resolveOAuthSignIn } from '@/lib/auth/oauthLink.js'
import { writeAudit } from '@/lib/audit.js'

function nodeReqToHeadersShim(req) {
    if (!req) return { headers: { get: () => null } }

    if (req.headers && typeof req.headers.get === 'function') return req

    const h = req.headers || {}
    return {
        headers: {
            get(name) {
                const v = h[String(name).toLowerCase()]
                if (Array.isArray(v)) return v[0]
                return v ?? null
            }
        }
    }
}

export const authOptions = {
    providers: [
        CredentialsProvider({
            name: 'credentials',

            credentials: {
                email: {
                    label: 'Email',
                    type: 'email'
                },
                password: {
                    label: 'Password',
                    type: 'password'
                }
            },

            // logging hygiene
            // ─────────────────────────────────
            // Twelve [AUTH] info-level console.log breadcrumbs were removed in V10-2.
            // V10-2.1 finished the cleanup: dropped the remaining `── new attempt ──`
            // info log and scrubbed `email` from the rate-limit warn. Failure paths
            // still log via console.warn but contain only counts/reasons/IP — never
            // email/userId/password/hash content.
            async authorize(credentials, req) {

                await connectDB()

                // --- 1. Zod validation ---
                const parsed = loginSchema.safeParse({
                    email: credentials?.email,
                    password: credentials?.password
                })

                if (!parsed.success) {
                    console.warn('[AUTH] zod-reject')
                    return null
                }

                // --- 2. Rate limit ---
                const ip = clientIp(nodeReqToHeadersShim(req))

                const rl = await consumeLoginLimit(ip, parsed.data.email)
                if (!rl.success) {
                    console.warn('[AUTH] rate-limited, ip =', ip, 'msBeforeNext =', rl.msBeforeNext)
                    return null
                }

                // --- 3. User lookup ---
                const user = await User.findOne({
                    email: String(parsed.data.email)
                })

                // --- 4. Lock check ---
                if (user && isLocked(user)) {
                    // Run bcrypt against the fake hash anyway so wall-clock duration
                    // matches the real bcrypt path — locked vs. unlocked accounts
                    // must be timing-indistinguishable.
                    await bcrypt.compare(parsed.data.password, await getFakeHash())
                    console.warn('[AUTH] locked-account attempt')
                    return null
                }

                // OAuth-only accounts have user.password === undefined.
                // Compare against the fake hash so timing matches the real path
                // (constant-time enumeration defence). The valid check below
                // will reject because !user.password short-circuits — so the
                // attacker can't distinguish "no such user" from "OAuth-only
                // user" from "wrong password" by timing OR by error message.
                const hash = user?.password || (await getFakeHash())

                // --- 5. bcrypt ---
                const valid = await bcrypt.compare(parsed.data.password, hash)

                // !user.password catches OAuth-only accounts: they have no
                // password to compare against, so credentials sign-in is
                // never valid for them. Same generic 401 either way.
                if (!user || !user.password || !valid) {
                    if (user && user.password) {
                        try {
                            const r = await recordLoginFailure(user._id)
                            console.warn('[AUTH] wrong-password, attempts =', r.attempts, 'locked =', r.locked)
                        } catch (err) {
                            console.error('[AUTH] recordLoginFailure failed:', err.message)
                        }
                    }
                    return null
                }

                if (user.disabled) {
                    console.warn('[AUTH] disabled-account attempt')
                    return null
                }

                if (user.failedLoginAttempts > 0 || user.lockUntil) {
                    try {
                        await clearLoginFailures(user._id)
                    } catch (err) {
                        console.error('[AUTH] clearLoginFailures failed:', err.message)
                    }
                }

                const role = user.role || user.status || 'basic'

                return {
                    id: user._id.toString(),
                    name: user.username,
                    email: user.email,
                    role
                }
            }
        }),

        // V11 — OAuth 2.0 / OIDC providers (opt-in via env vars).
        // buildOAuthProviders returns [] if no GOOGLE_/GITHUB_ creds are set,
        // so the email-OTP credentials flow above remains the only sign-in
        // path for deployments that don't configure OAuth.
        ...buildOAuthProviders()
    ],

    secret: process.env.NEXTAUTH_SECRET,

    pages: {
        signIn: '/auth/login'
    },

    session: {
        strategy: 'jwt'
    },

    callbacks: {
        /**
         * Gate every OAuth sign-in through resolveOAuthSignIn().
         *
         * For CredentialsProvider, NextAuth doesn't call signIn() with a
         * `provider` field that's an OAuth account — `account.type` will
         * be 'credentials' and we just allow it (authorize() already
         * vetted the user).
         *
         * For OAuth providers, this callback decides whether to allow the
         * sign-in based on the linking policy in oauthLink.js, mutates
         * the `user` object NextAuth is about to remember in the session,
         * and writes an audit-log entry (which mirrors to SIEM).
         */
        async signIn({ user, account, profile }) {
            // Credentials path — already vetted by authorize().
            if (!account || account.type === 'credentials') {
                return true
            }

            // OAuth/OIDC path.
            try {
                await connectDB()

                const result = await resolveOAuthSignIn({
                    provider: account.provider,
                    providerAccountId: account.providerAccountId,
                    profile
                })

                // Audit every decision — Mongo + SIEM (via the lib/audit.js sink).
                // Note: writeAudit's `actor` is the OAuth identity, even on
                // reject, so SOC analysts can correlate failed-link attempts
                // across multiple providers for the same email.
                try {
                    await writeAudit({
                        req: null,   // NextAuth doesn't pass req to signIn callback
                        actor: {
                            id: result.user?._id?.toString() || 'oauth-unknown',
                            email: profile?.email || 'unknown'
                        },
                        action: `auth.oauth.${result.action}`,
                        target: {
                            type: 'user',
                            id: result.user?._id?.toString() || null,
                            label: profile?.email || ''
                        },
                        before: null,
                        after: {
                            provider: account.provider,
                            providerAccountId: account.providerAccountId,
                            reason: result.reason
                        }
                    })
                } catch (auditErr) {
                    // writeAudit is already supposed to never throw, but
                    // belt-and-suspenders.
                    console.error('[AUTH oauth] audit write failed:', auditErr.message)
                }

                if (!result.allow) {
                    console.warn(
                        '[AUTH oauth] rejected provider=%s reason=%s',
                        account.provider,
                        result.reason
                    )
                    return false
                }

                // Mutate the NextAuth `user` object in-place. NextAuth uses
                // this object to seed the JWT (and hence the session). We
                // overwrite id/name/role with our User document's values so
                // the rest of the app (requireAdmin etc.) sees our IDs, not
                // the OAuth provider's.
                user.id = result.user._id.toString()
                user.name = result.user.username
                user.email = result.user.email
                user.role = result.user.role || 'basic'

                return true
            } catch (err) {
                console.error('[AUTH oauth] signIn callback error:', err.message)
                return false   // fail closed
            }
        },

        async jwt({ token, user }) {
            if (user) {
                token.role = user.role
                token.id = user.id
            }
            return token
        },

        async session({ session, token }) {
            if (session.user) {
                session.user.role = token.role
                session.user.id = token.id
            }
            return session
        },

        async redirect({ url, baseUrl }) {
            // Open-redirect-safe: only allow same-origin redirects.
            try {
                const target = new URL(url, baseUrl)
                const base = new URL(baseUrl)
                if (target.origin === base.origin) {
                    return target.toString()
                }
            } catch {
                // fall through
            }
            return baseUrl
        }
    },

    cookies: {
        sessionToken: {
            name: process.env.NODE_ENV === 'production'
                ? '__Secure-next-auth.session-token'
                : 'next-auth.session-token',
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production'
            }
        }
    }
}

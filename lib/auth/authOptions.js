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
            async authorize(credentials, req) {

                console.log('[AUTH] ── new attempt ──', {
                    emailReceived: typeof credentials?.email,
                    emailLen: credentials?.email?.length,
                    passwordLen: credentials?.password?.length
                })
                await connectDB()
                // --- 1. Zod validation ---
                const parsed = loginSchema.safeParse({
                    email: credentials?.email,
                    password: credentials?.password
                })

                if (!parsed.success) {
                    console.warn('[AUTH] ❌ zod-reject:', parsed.error.issues)
                    return null
                }

                // --- 2. Rate limit ---
                const ip = clientIp(nodeReqToHeadersShim(req))

                const rl = await consumeLoginLimit(ip, parsed.data.email)
                if (!rl.success) {
                    console.warn('[AUTH] ❌ rate-limited:', {
                        msBeforeNext: rl.msBeforeNext,
                        ip,
                        email: parsed.data.email
                    })
                    return null
                }
                // --- 3. User lookup ---
                const user = await User.findOne({
                    email: String(parsed.data.email)
                })
                // --- 4. Lock check ---
                if (user && isLocked(user)) {
                    await bcrypt.compare(parsed.data.password, await getFakeHash())
                    console.warn('[AUTH] locked account login attempt')
                    return null
                }

                const hash = user?.password || (await getFakeHash())
                // --- 5. bcrypt ---
                const t0 = Date.now()
                const valid = await bcrypt.compare(parsed.data.password, hash)

                if (!user || !valid) {
                    if (user) {
                        try {
                            const r = await recordLoginFailure(user._id)
                            console.warn('[AUTH] ❌ wrong password, attempts =', r.attempts, 'locked =', r.locked)
                        } catch (err) {
                            console.error('[AUTH] recordLoginFailure failed', err.message)
                        }
                    }
                    return null
                }

                if (user.disabled) {
                    console.warn('[AUTH] ❌ account disabled')
                    return null
                }

                if (user.failedLoginAttempts > 0 || user.lockUntil) {
                    try {
                        await clearLoginFailures(user._id)
                    } catch (err) {
                        console.error('[AUTH] clearLoginFailures failed', err.message)
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
        })
    ],

    secret: process.env.NEXTAUTH_SECRET,

    pages: {
        signIn: '/auth/login'
    },

    session: {
        strategy: 'jwt'
    },

    callbacks: {
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

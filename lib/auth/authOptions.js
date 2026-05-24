import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import User from '@/models/user.js'
import connectDB from '@/lib/mongodb.js'
import { loginSchema } from '@/lib/validators/auth.js'

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

            async authorize(credentials) {

                await connectDB()

                const parsed = loginSchema.safeParse({
                    email: credentials?.email,
                    password: credentials?.password
                })

                if (!parsed.success) {
                    return null
                }

                const fakeHash = process.env.FAKE_BCRYPT_HASH

                if (!fakeHash) {
                    throw new Error('Missing FAKE_BCRYPT_HASH')
                }

                const user = await User.findOne({
                    email: String(parsed.data.email)
                })

                const hash = user?.password || fakeHash

                const valid = await bcrypt.compare(
                    parsed.data.password,
                    hash
                )

                if (!user || !valid) {
                    console.warn('[AUTH] failed credential check')
                    return null
                }

                if (user.disabled) {
                    console.warn('[AUTH] account disabled')
                    return null
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

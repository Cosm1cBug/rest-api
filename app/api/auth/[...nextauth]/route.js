import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import User from '@/models/user.js'
import connectDB from '@/lib/mongodb.js'

const handler = NextAuth({

    providers: [
        CredentialsProvider({
            name: 'credentials',

            credentials: {
                username: {
                    label: 'Username',
                    type: 'text'
                },

                password: {
                    label: 'Password',
                    type: 'password'
                }
            },

            async authorize(credentials) {

                await connectDB()

                if (!credentials?.username || !credentials?.password) {
                    return null
                }

                const fakeHash = process.env.FAKE_BCRYPT_HASH

                if (!fakeHash) {
                    throw new Error('Missing FAKE_BCRYPT_HASH')
                }

                const user = await User.findOne({ username: credentials.username })

                const hash = user?.password || fakeHash

                const valid = await bcrypt.compare(
                    credentials.password,
                    hash
                )   

                if (!user || !valid) {
                    console.warn('[AUTH FAILED]', credentials.username)
                    return null
                }

                if (user.disabled) {
                    console.warn('[AUTH BLOCKED]', user.username)
                    return null
                }

                console.log('[AUTH SUCCESS]', user.username)

                return {
                    id: user._id.toString(),
                    name: user.username,
                    role: user.role || 'user'
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

        async redirect ({ url, baseUrl }) {
            if (url.startsWith(baseUrl)) {
                return url
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
})

export {
    handler as GET,
    handler as POST
}
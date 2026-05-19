import NextAuth from 'next-auth'
import bcrypt from 'bcryptjs'
import User from '@/models/user.js'
import connectDB from '@/lib/mongodb.js'
import CredentialsProvider from 'next-auth/providers/credentials'

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

                const user = await User.findOne({
                    username: credentials.username
                })

                const hash = user?.password || fakeHash

                const valid = await bcrypt.compare(
                    credentials.password,
                    hash
                )   

                if (!user || !valid) {
                    return null
                }

                return {
                    id: user._id.toString(),
                    name: user.username,
                    role: user.role
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
            }

            return token
        },

        async session({ session, token }) {
            session.user.role = token.role
            return session
        }
    },

    cookies: {
        sessionToken: {
            name: '__Secure-next-auth.session-token',
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
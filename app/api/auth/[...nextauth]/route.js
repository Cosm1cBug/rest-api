import NextAuth from 'next-auth'

import CredentialsProvider from 'next-auth/providers/credentials'

const handler = NextAuth({

    providers: [

        CredentialsProvider({

            name: 'credentials',

            credentials: {

                username: {},

                password: {}
            },

            async authorize(credentials) {

                /*
                |--------------------------------------------------------------------------
                | TEMP LOGIN
                |--------------------------------------------------------------------------
                */

                if (

                    credentials.username === 'admin' &&

                    credentials.password === 'adminX'

                ) {

                    return {

                        id: '1',

                        name: 'Admin'
                    }
                }

                return null
            }
        })
    ],

    secret:
        process.env.NEXTAUTH_SECRET,

    session: {

        strategy: 'jwt'
    }
})

export {

    handler as GET,

    handler as POST
}
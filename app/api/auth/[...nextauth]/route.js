import * as NextAuthModule from 'next-auth'

const NextAuth =
    NextAuthModule.default?.default
    || NextAuthModule.default
    || NextAuthModule
import { authOptions } from '@/lib/auth/authOptions.js'

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

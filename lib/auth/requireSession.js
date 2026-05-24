import { getToken } from 'next-auth/jwt'

/**
 * Reject the request unless it carries a valid NextAuth session JWT.
 *
 * @param {Request} req
 * @returns {Promise<
 *   | { ok: true, token: { id: string, role: string, name?: string } }
 *   | { ok: false, response: Response }
 * >}
 */
export async function requireSession(req) {
    if (!process.env.NEXTAUTH_SECRET) {
        return {
            ok: false,
            response: new Response(
                JSON.stringify({ success: false, error: 'Server misconfigured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }
    }

    let token = null
    try {
        token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    } catch {
        token = null
    }

    if (!token || !token.id) {
        return {
            ok: false,
            response: new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }
    }

    return { ok: true, token }
}
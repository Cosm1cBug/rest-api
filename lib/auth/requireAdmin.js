import { getToken } from 'next-auth/jwt'

/**
 * Returns null if the request is from an authenticated admin.
 * Otherwise returns a Response (401 or 403) that the route handler
 * should return immediately.
 *
 * Usage:
 *   export async function GET(req) {
 *       const denied = await requireAdmin(req)
 *       if (denied) return denied
 *       // ... admin-only logic
 *   }
 *
 * @param {Request} req
 * @returns {Promise<Response | null>}
 */
export async function requireAdmin(req) {
    if (!process.env.NEXTAUTH_SECRET) {
        // Fail closed: if the server is misconfigured, do not leak data.
        return new Response(
            JSON.stringify({ success: false, error: 'Server misconfigured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }

    let token
    try {
        token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    } catch {
        token = null
    }

    if (!token) {
        return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
    }

    if (token.role !== 'admin') {
        return new Response(
            JSON.stringify({ success: false, error: 'Forbidden' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
    }

    return null
}
import { getToken } from 'next-auth/jwt'

/**
 * Returns null if the request is from an authenticated admin.
 * Otherwise returns a Response (401 or 403) that the route handler
 * should return immediately.
 *
 * @param {Request} req
 * @returns {Promise<Response | null>}
 */
export async function requireAdmin(req) {
    const { response } = await requireAdminWithToken(req)
    return response
}

/**
 * Same gate, but also returns the decoded token on success.
 *
 * @param {Request} req
 * @returns {Promise<{ token: object | null, response: Response | null }>}
 */
export async function requireAdminWithToken(req) {
    if (!process.env.NEXTAUTH_SECRET) {
        return {
            token: null,
            response: new Response(
                JSON.stringify({ success: false, error: 'Server misconfigured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }
    }

    let token
    try {
        token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    } catch {
        token = null
    }

    if (!token) {
        return {
            token: null,
            response: new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
        }
    }

    if (token.role !== 'admin') {
        return {
            token: null,
            response: new Response(
                JSON.stringify({ success: false, error: 'Forbidden' }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            )
        }
    }

    return { token, response: null }
}

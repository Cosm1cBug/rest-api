/**
 * CSRF double-check for non-NextAuth POSTs.
 *
 * STATUS: HELPER ONLY — NOT YET WIRED INTO ANY ROUTE.
 * ──────────────────────────────────────────────────────
 * Adding this to existing user-mutation routes is a breaking change
 * for any client that doesn't already fetch /api/auth/csrf first.
 * The in-app UI pages currently don't, so wiring it requires a
 * coordinated UI update across:
 *   - app/user/profile/page.jsx
 *   - app/user/change-password/page.jsx
 *   - app/user/api-keys/page.jsx
 *   - app/user/delete-account/page.jsx
 *   - app/admin/users/page.jsx
 *   - app/admin/users/[id]/page.jsx
 *
 * Plan for wiring (separate batch):
 *   1. Add a useCsrfToken() hook that fetches once per session
 *   2. Wire every mutation fetch() through it
 *   3. Then enable requireCsrf() on the corresponding API routes
 *      one at a time
 *
 * Until then: the helper is here, the test coverage is here, and the
 * security model is documented — but the routes are unchanged.
 *
 * NextAuth's own /api/auth/callback/credentials POST checks a CSRF
 * token internally (fetched from /api/auth/csrf). But our user-
 * mutation routes (/api/user/update, /api/user/change-password,
 * /api/user/api-keys, etc.) only validate Content-Type via
 * requireJson() + rely on the SessionCookie's SameSite=lax to block
 * cross-site form posts.
 *
 * SameSite=lax + JSON content-type already blocks the obvious vectors
 * (form posts, image tag GETs). What this helper adds is defense
 * against:
 *   - Browser bugs / quirks that exempt some flows from SameSite
 *   - Sub-domain attacks (SameSite=lax allows same-site sub-domains)
 *   - Browser extensions or other userland that can write arbitrary
 *     headers but not arbitrary cookies
 *
 * Implementation
 * ──────────────
 * NextAuth's CSRF cookie is `next-auth.csrf-token` (or
 * `__Host-next-auth.csrf-token` in production). Its value is
 * `<token>|<hash>` where hash = sha256(token + NEXTAUTH_SECRET).
 *
 * Clients must send the bare token (first half before the `|`) in
 * the `x-csrf-token` header. The check is:
 *   1. Read the cookie, split on `|`, extract token
 *   2. Compare token === header (constant-time)
 *
 * Returns null if OK, or a 403 Response if mismatched. Place after
 * requireJson + requireSession, before reading the body.
 *
 * Usage in a handler:
 *
 *   const ctDenied = requireJson(req)
 *   if (ctDenied) return ctDenied
 *
 *   const session = await getServerSession(authOptions)
 *   if (!session) return unauthorised()
 *
 *   const csrfDenied = await requireCsrf(req)   // ← V15 item #3
 *   if (csrfDenied) return csrfDenied
 *
 *   const body = await req.json()
 *   ...
 *
 * Client-side: clients that already do
 *   const csrfRes = await fetch('/api/auth/csrf')
 *   const { csrfToken } = await csrfRes.json()
 *   fetch('/api/user/update', { headers: { 'x-csrf-token': csrfToken } })
 * pass automatically. Existing clients that don't send the header get
 * 403 until they're updated — this is a BREAKING change for any
 * external API consumer that uses the session cookie (most should be
 * fine since browser JS already needs to fetch the CSRF token anyway).
 */

import crypto from 'crypto'

const PROD_COOKIE = '__Host-next-auth.csrf-token'
const DEV_COOKIE  = 'next-auth.csrf-token'

function readCookie(req, name) {
    const header = req.headers?.get?.('cookie')
    if (!header) return null
    // Manual parse — Next.js's req doesn't expose cookies() on plain Request
    // objects in route handlers. Format: 'a=b; c=d; e=f'.
    for (const part of header.split(';')) {
        const eq = part.indexOf('=')
        if (eq === -1) continue
        const k = part.slice(0, eq).trim()
        if (k === name) {
            return decodeURIComponent(part.slice(eq + 1).trim())
        }
    }
    return null
}

function timingSafeEqualStr(a, b) {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return crypto.timingSafeEqual(ab, bb)
}

export async function requireCsrf(req) {
    const cookieName = process.env.NODE_ENV === 'production'
        ? PROD_COOKIE
        : DEV_COOKIE
    const raw = readCookie(req, cookieName)

    if (!raw) {
        return Response.json(
            { success: false, message: 'CSRF token cookie missing. Fetch /api/auth/csrf first.' },
            { status: 403 }
        )
    }

    // NextAuth format: `<token>|<hash>`
    const idx = raw.indexOf('|')
    const cookieToken = idx === -1 ? raw : raw.slice(0, idx)

    const header = req.headers?.get?.('x-csrf-token') || ''
    if (!header) {
        return Response.json(
            { success: false, message: 'CSRF token header missing. Send x-csrf-token.' },
            { status: 403 }
        )
    }

    if (!timingSafeEqualStr(cookieToken, header)) {
        return Response.json(
            { success: false, message: 'CSRF token mismatch.' },
            { status: 403 }
        )
    }

    return null
}

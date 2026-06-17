import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

const ADMIN_PREFIXES = [
    '/api/:path',
    '/dashboard/:path',
    '/admin/:path'
]

const PUBLIC_EXCEPTIONS = []

function isAdminPath(pathname) {
    if (PUBLIC_EXCEPTIONS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
        return false
    }
    return ADMIN_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Strict CSP with per-request nonce.
 *
 * The previous CSP allowed `'unsafe-inline'` for script-src because
 * Next.js hydration injects inline `__next_f.push(...)` scripts.
 * `'unsafe-inline'` neutralises 90% of the XSS protection a CSP buys
 * you — any reflected XSS sink would just inject more inline JS.
 *
 * The fix is the nonce pattern documented by Next.js itself:
 *   1. middleware generates a fresh random nonce per request
 *   2. CSP allows scripts only when they carry `nonce-<value>`
 *   3. middleware forwards the nonce on the REQUEST headers via `x-nonce`
 *   4. Next.js reads that header and auto-attaches the attribute to its
 *      own hydration scripts (this is built-in behaviour)
 *   5. our root layout reads the same header to nonce any future custom
 *      <script> tags we add
 *
 * `'strict-dynamic'` lets any script that's nonced bootstrap further
 * scripts via document.createElement — required by some bundler shapes;
 * harmless because the bootstrap chain still anchors on a nonce.
 *
 * Dev-mode allowances
 * ───────────────────
 * `next dev` injects React Fast Refresh code via `eval` and inline
 * styles via styled-jsx. Without `'unsafe-eval'` + `'unsafe-inline'`
 * for styles, the dev server doesn't work. We gate these allowances
 * on NODE_ENV !== 'production' so production stays tight.
 *
 * Style-src kept at `'unsafe-inline'` in production because Tailwind's
 * runtime + Next's CSS-in-JS injection currently rely on it. Tightening
 * style-src is a separate exercise (item #2.1, future) — the high-value
 * win is locking script-src.
 *
 * Edge-cases for operators to verify in a real browser after deploy
 * ────────────────────────────────────────────────────────────────
 *   - Dashboard live feed via Socket.IO — connect-src has ws: wss: ✓
 *   - OAuth redirects — form-action 'self' ✓; consider listing
 *     accounts.google.com if you wire OAuth via the popup flow
 *   - Any future analytics/CDN scripts — must be added to script-src
 *     OR carry the nonce; failures show in the browser console as
 *     "Refused to execute inline script because it violates ..."
 *
 * If the dashboard breaks in production, the one-line rollback is to
 * change script-src back to `'self' 'unsafe-inline'`. The nonce header
 * stays on the response either way (harmless) so a future re-attempt
 * is fast.
 */
function buildCsp(nonce, isDev) {
    const scriptSrc = isDev
        ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`   // 'unsafe-eval' for React Fast Refresh
        : `'self' 'nonce-${nonce}' 'strict-dynamic'`

    // Style-src: still needs 'unsafe-inline' for the moment. Tailwind v4
    // and Next.js style-jsx inject runtime <style> tags without nonces.
    // Tightening this requires either nonce-style-tags (Next 16+ feature)
    // or moving entirely to compiled-out CSS. Leave at unsafe-inline for
    // now and tighten in a follow-up batch.
    const styleSrc = `'self' 'unsafe-inline'`

    return [
        `default-src 'self'`,
        `script-src ${scriptSrc}`,
        `style-src ${styleSrc}`,
        `img-src 'self' data: blob:`,
        `font-src 'self' data:`,
        `connect-src 'self' ws: wss:`,
        `frame-ancestors 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `object-src 'none'`,
        `upgrade-insecure-requests`
    ].join('; ')
}

export async function middleware(req) {

    // Generate a fresh nonce per request. crypto.randomUUID
    // is the standard modern way; base64-encoding is cosmetic but matches
    // the docs.
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
    const isDev = process.env.NODE_ENV !== 'production'
    const csp = buildCsp(nonce, isDev)

    // Forward the nonce on the REQUEST headers so route handlers (and
    // Next's own hydration script injector) can pick it up.
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)

    const response = NextResponse.next({
        request: { headers: requestHeaders }
    })

    // --- Security headers ---
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Content-Security-Policy', csp)
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()')
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
    response.headers.set('X-DNS-Prefetch-Control', 'off')

    // --- Admin gate ---
    const pathname = req.nextUrl.pathname

    if (isAdminPath(pathname)) {

        if (!process.env.NEXTAUTH_SECRET) {
            return new NextResponse(
                JSON.stringify({ success: false, error: 'Server misconfigured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        }

        let token = null
        try {
            token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
        } catch {
            token = null
        }

        if (!token) {
            if (pathname.startsWith('/api/')) {
                return new NextResponse(
                    JSON.stringify({ success: false, error: 'Unauthorized' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                )
            }
            const loginUrl = new URL('/auth/login', req.url)
            loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
            return NextResponse.redirect(loginUrl)
        }

        if (token.role !== 'admin') {
            if (pathname.startsWith('/api/')) {
                return new NextResponse(
                    JSON.stringify({ success: false, error: 'Forbidden' }),
                    { status: 403, headers: { 'Content-Type': 'application/json' } }
                )
            }
            return NextResponse.redirect(new URL('/', req.url))
        }
    }

    return response
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|public/).*)'
    ]
}

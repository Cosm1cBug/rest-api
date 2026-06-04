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

const CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
].join('; ')

export async function middleware(req) {

    const response = NextResponse.next()

    // --- Security headers ---
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Content-Security-Policy', CSP_DIRECTIVES)
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
    )
    response.headers.set(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
    )
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

import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Path prefixes that require an authenticated admin.
const ADMIN_PREFIXES = [
    '/api/dashboard',
    '/dashboard',
    '/admin'
]

// Public routes inside otherwise-protected prefixes (none today, but kept for future use).
const PUBLIC_EXCEPTIONS = []

function isAdminPath(pathname) {
    if (PUBLIC_EXCEPTIONS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
        return false
    }
    return ADMIN_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export function middleware(req) {

    const response = NextResponse.next()

    response.headers.set(
        'X-Frame-Options',
        'DENY'
    )

    response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'"
    )

    response.headers.set(
        'X-Content-Type-Options',
        'nosniff'
    )

    response.headers.set(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
    )

    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=()'
    )

    response.headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
    )

    // --- Admin gate ---
    const pathname = req.nextUrl.pathname

    if (isAdminPath(pathname)) {

        if (!process.env.NEXTAUTH_SECRET) {
            // Fail closed if the server is misconfigured.
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
            // For HTML page navigations, redirect to login; for API calls, return JSON 401.
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
        '/api/:path*',
        '/dashboard/:path*',
        '/admin/:path*'
    ]
}
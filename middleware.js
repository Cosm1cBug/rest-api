import { NextResponse }
from 'next/server'

export function middleware(req) {

    const response = NextResponse.next()

    response.headers.set(
        'X-Frame-Options',
        'DENY'
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

    return response
}

export const config = {

    matcher: [
        '/api/:path*',
        '/dashboard/:path*'
    ]
}
/** @type {import('next').NextConfig} */

const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,

    // output: 'standalone' produces a minimal
    // self-contained server in .next/standalone/ at build time. The
    // Dockerfile copies only that directory (and a few asset folders)
    // instead of the full node_modules, cutting image size by ~80%
    // and shortening rolling-deploy times proportionally.
    //
    // Next.js's file tracer walks every reachable import from
    // server-side entry points and includes ONLY those node_modules
    // entries. The serverExternalPackages list below tells it not to
    // try to bundle native modules (they stay as require() at runtime).
    output: 'standalone',

    serverExternalPackages: [
        'geoip-lite',
        'mongoose',
        'bullmq',
        'bcryptjs',
        'ioredis',
        'nodemailer',
        '@bull-board/api',
        '@bull-board/express'
    ],

    // geoip-lite ships its city database as a data file the standard
    // tracer doesn't follow. outputFileTracingIncludes copies it
    // into .next/standalone/ so the runtime can resolve it.
    outputFileTracingIncludes: {
        '/**': ['./node_modules/geoip-lite/data/**']
    }
}

export default nextConfig

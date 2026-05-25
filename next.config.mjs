/** @type {import('next').NextConfig} */

const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
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
    outputFileTracingIncludes: {
        '/**': ['./node_modules/geoip-lite/data/**']
    }
}

export default nextConfig

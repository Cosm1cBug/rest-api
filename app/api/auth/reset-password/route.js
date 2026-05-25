import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import PasswordReset from '@/models/passwordReset.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { clientIp } from '@/lib/clientIp.js'
import { consumeResetVerifyLimit } from '@/lib/auth/passwordResetRateLimit.js'
import { clearLoginFailures } from '@/lib/auth/loginLockout.js'

const BCRYPT_ROUNDS = 12

const schema = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid token'),
    password: z.string().min(8).max(100)
}).strict()

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex')
}

export async function POST(req) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    const ip = clientIp(req)
    const rl = await consumeResetVerifyLimit(ip)
    if (!rl.success) {
        const retryAfter = Math.ceil(rl.msBeforeNext / 1000)
        return Response.json(
            { success: false, message: 'Too many requests. Please wait and try again.' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
    }

    let body
    try {
        body = await req.json()
    } catch {
        return Response.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        return Response.json(
            { success: false, message: 'Token and new password are required.' },
            { status: 400 }
        )
    }

    try {
        await connectDB()

        const tokenHash = hashToken(parsed.data.token)

        const claimed = await PasswordReset.findOneAndUpdate(
            {
                tokenHash,
                usedAt: null,
                expiresAt: { $gt: new Date() }
            },
            { $set: { usedAt: new Date() } },
            { new: true }
        )

        if (!claimed) {
            return Response.json(
                { success: false, message: 'This reset link is invalid or has expired.' },
                { status: 400 }
            )
        }

        const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS)

        await User.updateOne(
            { _id: claimed.userId },
            { $set: { password: passwordHash } }
        )

        await clearLoginFailures(claimed.userId)

        await PasswordReset.deleteOne({ _id: claimed._id }).catch(() => {})

        await PasswordReset.deleteMany({ userId: claimed.userId }).catch(() => {})

        return Response.json({
            success: true,
            message: 'Password updated. You can now sign in with the new password.'
        })
    } catch (err) {
        console.error('[reset-password] error:', err)
        return Response.json(
            { success: false, message: 'Something went wrong. Please try again.' },
            { status: 500 }
        )
    }
}

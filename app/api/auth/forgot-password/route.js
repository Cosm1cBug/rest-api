import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import PasswordReset from '@/models/passwordReset.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { clientIp } from '@/lib/clientIp.js'
import { jitterDelay } from '@/lib/auth/timing.js'
import { consumeResetRequestLimit } from '@/lib/auth/passwordResetRateLimit.js'

const TOKEN_TTL_MS = 60 * 60 * 1000   // 1 hour

const schema = z.object({
    email: z.string().email().max(254).trim().toLowerCase()
}).strict()

const GENERIC_OK = {
    success: true,
    message: 'If an account exists for this address, a password reset link has been sent.'
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex')
}

async function sendResetEmail(to, link) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('[forgot-password] EMAIL_USER/PASS not set; cannot send.')
        return
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    })

    await transporter.sendMail({
        from: `"OrbitNode" <${process.env.EMAIL_USER}>`,
        to,
        subject: 'Reset your OrbitNode password',
        text: `We received a request to reset your password.\n\nReset link (valid for 1 hour):\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;">
                <h2>Reset your password</h2>
                <p>We received a request to reset your password. Click the link below to choose a new one. This link expires in <strong>1 hour</strong>.</p>
                <p>
                    <a href="${link}"
                       style="display:inline-block;background:#483AA0;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;">
                        Reset password
                    </a>
                </p>
                <p style="color:#888;font-size:0.85rem;margin-top:16px;">
                    If you did not request this, you can safely ignore this email.
                </p>
            </div>
        `
    })
}

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password-reset email (anti-enumeration generic response)
 *     description: |
 *       Generic 200 regardless of whether the email is registered. The reset
 *       token is hashed (SHA-256) before storage; only the hash is persisted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, maxLength: 254 }
 *     responses:
 *       200: { description: Generic `if account exists, link sent` message. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
export async function POST(req) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    let body
    try {
        body = await req.json()
    } catch {
        return Response.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        // Invalid email shape is a client bug, NOT enumeration. 400 is fine.
        return Response.json({ success: false, message: 'Invalid email address.' }, { status: 400 })
    }

    const email = parsed.data.email
    const ip = clientIp(req)

    // --- Rate limit BEFORE existence check so enumeration probes still trip ---
    const rl = await consumeResetRequestLimit(ip, email)
    if (!rl.success) {
        const retryAfter = Math.ceil(rl.msBeforeNext / 1000)
        return Response.json(
            { success: false, message: 'Too many requests. Please wait and try again.' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
    }

    try {
        await connectDB()
        const user = await User.findOne({ email }).select('_id email').lean()

        if (!user) {
            // Anti-enumeration: silent drop, jittered to match the real path.
            console.info('[forgot-password] no matching user (silent drop)')
            await jitterDelay()
            return Response.json(GENERIC_OK, { status: 200 })
        }

        // Invalidate any outstanding tokens for this user so a leaked
        // earlier token cannot be used after a fresh request.
        await PasswordReset.deleteMany({ userId: user._id })

        // Generate the token (256 bits of entropy) and persist only its hash.
        const token = crypto.randomBytes(32).toString('hex')   // 64 hex chars
        const tokenHash = hashToken(token)

        await PasswordReset.create({
            userId: user._id,
            tokenHash,
            expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
        })

        const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
        const link = `${base.replace(/\/+$/, '')}/auth/reset-password?token=${token}`

        await sendResetEmail(user.email, link)
    } catch (err) {
        console.error('[forgot-password] error:', err)
    }

    return Response.json(GENERIC_OK, { status: 200 })
}

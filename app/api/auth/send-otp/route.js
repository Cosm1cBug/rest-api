import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import Otp from '@/models/otp.js'
import { redis } from '@/lib/redis.js'
import nodemailer from 'nodemailer'
import crypto from 'crypto'
import { jitterDelay } from '@/lib/auth/timing.js'
import { requireJson } from '@/lib/auth/requireJson.js'
// Rate limit: max 3 OTP sends per email per 10 minutes
const OTP_RATE_LIMIT = 3
const OTP_RATE_WINDOW = 10 * 60 // seconds
const OTP_TTL = 5 * 60 // 5 minutes — matches OtpSchema `expires: 300`

// A single message we return for ALL non-error outcomes so attackers cannot
// distinguish "email free → OTP sent" from "email already registered → silently dropped".
const GENERIC_OK = {
    success: true,
    message: 'If this email is eligible, an OTP has been sent. Please check your inbox.'
}

function generateOtp() {
    // Cryptographically random 6-digit code, zero-padded
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

async function sendOtpEmail(to, code) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    })

    await transporter.sendMail({
        from: `"OrbitNode" <${process.env.EMAIL_USER}>`,
        to,
        subject: 'Your OTP Code',
        text: `Your OTP code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;">
                <h2>Verify your email</h2>
                <p>Use the code below to complete your registration:</p>
                <div style="font-size:2rem;font-weight:bold;letter-spacing:0.3em;padding:16px;background:#f0f0f0;border-radius:8px;text-align:center;">
                    ${code}
                </div>
                <p style="color:#888;font-size:0.85rem;margin-top:16px;">
                    This code expires in <strong>5 minutes</strong>. If you did not request this, you can safely ignore this email.
                </p>
            </div>
        `
    })
}

/**
 * @openapi
 * /api/auth/send-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Send registration OTP (anti-enumeration generic response)
 *     description: |
 *       Returns the same generic 200 whether the email is registered or not.
 *       Rate-limited 3 sends per email per 10 minutes; response timing is
 *       jittered so it cannot be used as an enumeration oracle.
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
 *       200: { description: Generic `if eligible, OTP sent` message. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 *       503: { description: Email service not configured (EMAIL_USER / EMAIL_PASS unset). }
 */
export async function POST(req) {
    try {
        const ctDenied = requireJson(req)
        if (ctDenied) return ctDenied
        const body = await req.json().catch(() => ({}))
        const { email } = body

        // --- Input validation ---
        // We DO return a distinct 400 for missing/malformed email because
        // that is a client-side bug, not user-data enumeration. The check
        // also rejects non-string inputs (NoSQL injection defence).
        if (!email || typeof email !== 'string') {
            return Response.json(
                { success: false, message: 'Email is required.' },
                { status: 400 }
            )
        }

        const normalizedEmail = email.toLowerCase().trim()
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail)) {
            return Response.json(
                { success: false, message: 'Invalid email address.' },
                { status: 400 }
            )
        }

        // --- Rate limiting: max OTP_RATE_LIMIT sends per email per window ---
        // Run this BEFORE the existence check so the limiter still applies
        // to enumeration probes (otherwise an attacker could bypass it by
        // only ever hitting already-registered emails).
        const rateLimitKey = `otp-rate:${normalizedEmail}`
        const sends = await redis.incr(rateLimitKey)

        if (sends === 1) {
            await redis.expire(rateLimitKey, OTP_RATE_WINDOW)
        }

        if (sends > OTP_RATE_LIMIT) {
            // 429 is unavoidable here — silently swallowing repeated requests
            // would expose the service to floods. We still do not differentiate
            // by whether the email exists.
            return Response.json(
                { success: false, message: 'Too many OTP requests. Please wait 10 minutes before trying again.' },
                { status: 429 }
            )
        }

        // --- Email service check ---
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.error('[send-otp] EMAIL_USER or EMAIL_PASS is not set.')
            return Response.json(
                { success: false, message: 'Email service is not configured.' },
                { status: 503 }
            )
        }

        await connectDB()

        // --- Existence check, performed WITHOUT branching the response ---
        // If the email is already registered we deliberately do nothing:
        //   - no OTP is created
        //   - no email is sent
        //   - the response is identical to the "real" path
        // The legitimate owner of an existing account will not see an OTP
        // in their inbox; an attacker probing for valid accounts will see
        // exactly the same JSON, status code, and (approximately) timing.
        const existing = await User.exists({ email: normalizedEmail })

        if (existing) {
            // Audit log — useful for spotting brute-force-style enumeration
            // attempts internally, but NEVER exposed on the wire.
            console.info('[send-otp] suppressed: address already registered')

            // Match the wall-clock duration of the real send path so the
            // response time is not a side channel.
            await jitterDelay()

            return Response.json(GENERIC_OK, { status: 200 })
        }

        // --- Real send path ---
        // Delete any existing OTP for this email (prevent stale codes).
        await Otp.deleteMany({ email: normalizedEmail })

        const code = generateOtp()
        const expiresAt = new Date(Date.now() + OTP_TTL * 1000)

        await Otp.create({
            email: normalizedEmail,
            code,
            expiresAt
        })

        await sendOtpEmail(normalizedEmail, code)

        return Response.json(GENERIC_OK, { status: 200 })

    } catch (err) {
        console.error('[send-otp] Error:', err)
        return Response.json(
            { success: false, message: 'Failed to send OTP. Please try again.' },
            { status: 500 }
        )
    }
}

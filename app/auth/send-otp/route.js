import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import Otp from '@/models/otp.js'
import { redis } from '@/lib/redis.js'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

// Rate limit: max 3 OTP sends per email per 10 minutes
const OTP_RATE_LIMIT = 3
const OTP_RATE_WINDOW = 10 * 60 // seconds
const OTP_TTL = 5 * 60 // 5 minutes — matches OtpSchema `expires: 300`

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

export async function POST(req) {
    try {
        const body = await req.json()
        const { email } = body

        // --- Input validation ---
        if (!email || typeof email !== 'string') {
            return Response.json(
                { success: false, message: 'Email is required.' },
                { status: 400 }
            )
        }

        const normalizedEmail = email.toLowerCase().trim()
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(normalizedEmail)) {
            return Response.json(
                { success: false, message: 'Invalid email address.' },
                { status: 400 }
            )
        }

        await connectDB()

        // --- Check email not already registered ---
        const existing = await User.findOne({ email: normalizedEmail })
        if (existing) {
            return Response.json(
                { success: false, message: 'This email is already registered.' },
                { status: 409 }
            )
        }

        // --- Rate limiting: max OTP_RATE_LIMIT sends per email per window ---
        const rateLimitKey = `otp-rate:${normalizedEmail}`
        const sends = await redis.incr(rateLimitKey)

        if (sends === 1) {
            // First send — set the window expiry
            await redis.expire(rateLimitKey, OTP_RATE_WINDOW)
        }

        if (sends > OTP_RATE_LIMIT) {
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

        // --- Delete any existing OTP for this email (prevent stale codes) ---
        await Otp.deleteMany({ email: normalizedEmail })

        // --- Generate and store OTP ---
        const code = generateOtp()
        const expiresAt = new Date(Date.now() + OTP_TTL * 1000)

        await Otp.create({
            email: normalizedEmail,
            code,
            expiresAt
        })

        // --- Send email ---
        await sendOtpEmail(normalizedEmail, code)

        return Response.json(
            { success: true, message: 'OTP sent to your email. Please check your inbox.' },
            { status: 200 }
        )

    } catch (err) {
        console.error('[send-otp] Error:', err)
        return Response.json(
            { success: false, message: 'Failed to send OTP. Please try again.' },
            { status: 500 }
        )
    }
}
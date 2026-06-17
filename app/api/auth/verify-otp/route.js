import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import Otp from '@/models/otp.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { registerSchema } from '@/lib/validators/auth.js'
import { consumeOtpVerifyLimit } from '@/lib/auth/otpRateLimit.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { clientIp } from '@/lib/clientIp.js'
import { issueApiKey } from '@/lib/auth/apiKeys.js'

const BCRYPT_ROUNDS = 12
const MAX_OTP_ATTEMPTS = 5

const DUPLICATE_ACCOUNT_ERROR = {
    success: false,
    message: 'Could not create account with the provided details. Please try a different username or email.'
}

/**
 * @openapi
 * /api/auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify OTP + create account (returns one-time API key)
 *     description: |
 *       On success returns plaintext `apiKey` — server only stores the bcrypt
 *       hash, so this is the user's only chance to save it. Per-OTP attempt
 *       cap (5), per-(IP, email) and per-IP Redis rate limits. Email or
 *       username collisions return a single generic 409 to prevent enumeration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password, otp]
 *             properties:
 *               username: { type: string, minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_.-]+$' }
 *               email:    { type: string, format: email, maxLength: 254 }
 *               password: { type: string, minLength: 8, maxLength: 100 }
 *               otp:      { type: string, pattern: '^[0-9]{6}$' }
 *     responses:
 *       201:
 *         description: Account created. Save `apiKey` immediately — not shown again.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:  { type: boolean }
 *                 message:  { type: string }
 *                 apiKey:   { type: string, description: 'keyId.secret format. Show ONCE.' }
 *                 apiKeyId: { type: string }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: 'Email or username already in use (generic, to prevent enumeration).' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
export async function POST(req) {
    try {
        const ctDenied = requireJson(req)
        if (ctDenied) return ctDenied

        const body = await req.json().catch(() => ({}))
        const { username, email, password, otp } = body

        // --- Input validation via Zod schema ---
        const parsed = registerSchema.safeParse({ username, email, password })

        if (!parsed.success) {
            const message = parsed.error.errors[0]?.message || 'Invalid input.'
            return Response.json(
                { success: false, message },
                { status: 400 }
            )
        }

        // --- OTP shape validation ---
        if (!otp || typeof otp !== 'string') {
            return Response.json(
                { success: false, message: 'OTP is required.' },
                { status: 400 }
            )
        }

        const otpCode = otp.trim()
        if (!/^\d{6}$/.test(otpCode)) {
            return Response.json(
                { success: false, message: 'OTP must be a 6-digit number.' },
                { status: 400 }
            )
        }

        const normalizedEmail = parsed.data.email   // Zod has trimmed/lowercased

        // --- Rate limit (per-IP + per-(IP, email)) BEFORE touching the DB ---
        const ip = clientIp(req)
        const limit = await consumeOtpVerifyLimit(ip, normalizedEmail)
        if (!limit.success) {
            const retryAfter = Math.ceil((limit.msBeforeNext ?? 60_000) / 1000)
            return Response.json(
                { success: false, message: 'Too many verification attempts. Please wait and try again.' },
                {
                    status: 429,
                    headers: { 'Retry-After': String(retryAfter) }
                }
            )
        }

        await connectDB()

        // --- Look up OTP record ---
        const otpRecord = await Otp.findOne({ email: normalizedEmail })

        if (!otpRecord) {
            return Response.json(
                { success: false, message: 'OTP not found or already expired. Please request a new one.' },
                { status: 400 }
            )
        }

        // --- Expiry check (belt-and-suspenders on top of Mongoose TTL) ---
        if (otpRecord.expiresAt < new Date()) {
            await Otp.deleteOne({ _id: otpRecord._id })
            return Response.json(
                { success: false, message: 'OTP has expired. Please request a new one.' },
                { status: 400 }
            )
        }

        // --- Per-OTP attempt cap (defeats 6-digit brute force) ---
        if ((otpRecord.attempts || 0) >= MAX_OTP_ATTEMPTS) {
            await Otp.deleteOne({ _id: otpRecord._id })
            return Response.json(
                { success: false, message: 'Too many failed attempts. Please request a new OTP.' },
                { status: 429 }
            )
        }

        // --- Constant-time code comparison ---
        const expected = Buffer.from(otpRecord.code)
        const received = Buffer.from(otpCode)
        const codesMatch = expected.length === received.length && crypto.timingSafeEqual(expected, received)

        if (!codesMatch) {
            const updated = await Otp.findOneAndUpdate(
                { _id: otpRecord._id },
                { $inc: { attempts: 1 } },
                { new: true }
            )
            if (updated && updated.attempts >= MAX_OTP_ATTEMPTS) {
                await Otp.deleteOne({ _id: updated._id })
            }
            return Response.json(
                { success: false, message: 'Invalid OTP.' },
                { status: 400 }
            )
        }

        // --- Duplicate check (single generic error) ---
        const [emailTaken, usernameTaken] = await Promise.all([
            User.exists({ email: normalizedEmail }),
            User.exists({ username: parsed.data.username })
        ])

        if (emailTaken || usernameTaken) {
            console.info(
                '[verify-otp] account creation suppressed: duplicate %s',
                emailTaken && usernameTaken
                    ? 'email+username'
                    : (emailTaken ? 'email' : 'username')
            )
            return Response.json(DUPLICATE_ACCOUNT_ERROR, { status: 409 })
        }

        // --- Hash password ---
        const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS)

        // --- Create user (race-safe via unique-index catch) ---
        let createdUser
        try {
            createdUser = await User.create({
                username: parsed.data.username,
                email: normalizedEmail,
                password: passwordHash,
                role: 'basic'
            })
        } catch (err) {
            if (err && err.code === 11000) {
                console.info('[verify-otp] account creation suppressed: duplicate (race)')
                return Response.json(DUPLICATE_ACCOUNT_ERROR, { status: 409 })
            }
            throw err
        }

        // --- Issue the user's first API key ---
        const { apiKey, keyId } = await issueApiKey(createdUser._id, { label: 'default' })

        // --- Consume OTP so it cannot be reused ---
        await Otp.deleteOne({ _id: otpRecord._id })

        return Response.json(
            {
                success: true,
                message: 'Account created successfully. Save your API key now — it will not be shown again.',
                apiKey,
                apiKeyId: keyId
            },
            { status: 201 }
        )

    } catch (err) {
        console.error('[verify-otp] Error:', err)
        return Response.json(
            { success: false, message: 'Something went wrong. Please try again.' },
            { status: 500 }
        )
    }
}

import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import Otp from '@/models/otp.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { registerSchema } from '@/lib/validators/auth.js'
import { consumeOtpVerifyLimit } from '@/lib/auth/otpRateLimit.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { clientIp } from '@/lib/clientIp.js'

const BCRYPT_ROUNDS = 12

const MAX_OTP_ATTEMPTS = 5

const DUPLICATE_ACCOUNT_ERROR = {
    success: false,
    message: 'Could not create account with the provided details. Please try a different username or email.'
}

async function generateApiKey() {
    const keyId = crypto.randomBytes(8).toString('hex')      // 16 hex chars
    const secret = crypto.randomBytes(24).toString('hex')    // 48 hex chars
    const keyHash = await bcrypt.hash(secret, BCRYPT_ROUNDS)
    const apiKey = `${keyId}.${secret}`
    return { keyId, keyHash, apiKey }
}

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

        // --- OTP validation ---
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

        // parsed.data.email has already been trimmed/lowercased by Zod.
        const normalizedEmail = parsed.data.email

        // --- Rate limit: per-IP + per-(IP, email) ---
        // Enforced BEFORE touching the DB so brute-force traffic does not
        // become a database DoS.
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

        // --- Check expiry (belt-and-suspenders on top of Mongoose TTL index) ---
        if (otpRecord.expiresAt < new Date()) {
            await Otp.deleteOne({ _id: otpRecord._id })
            return Response.json(
                { success: false, message: 'OTP has expired. Please request a new one.' },
                { status: 400 }
            )
        }

        // --- Per-OTP attempt cap ---
        // Burn the record the moment it has accumulated too many failures,
        // BEFORE comparing the supplied code. This guarantees an attacker
        // gets at most MAX_OTP_ATTEMPTS guesses regardless of concurrency.
        if ((otpRecord.attempts || 0) >= MAX_OTP_ATTEMPTS) {
            await Otp.deleteOne({ _id: otpRecord._id })
            return Response.json(
                { success: false, message: 'Too many failed attempts. Please request a new OTP.' },
                { status: 429 }
            )
        }

        // --- Constant-time code comparison to prevent timing attacks ---
        const expected = Buffer.from(otpRecord.code)
        const received = Buffer.from(otpCode)
        const codesMatch = expected.length === received.length && crypto.timingSafeEqual(expected, received)

        if (!codesMatch) {
            // Atomically increment the attempt counter. If this push tips us
            // past the threshold, destroy the record so a concurrent verifier
            // cannot squeeze in one more guess.
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

        // --- Duplicate check (generic error — see Fix #8) ---
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

        // --- Hash password and generate API key ---
        const [passwordHash, { keyId, keyHash, apiKey }] = await Promise.all([
            bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
            generateApiKey()
        ])

        // --- Create user (race-safe via unique-index catch) ---
        try {
            await User.create({
                username: parsed.data.username,
                email: normalizedEmail,
                password: passwordHash,
                keyId,
                keyHash,
                role: 'basic'
            })
        } catch (err) {
            if (err && err.code === 11000) {
                console.info('[verify-otp] account creation suppressed: duplicate (race)')
                return Response.json(DUPLICATE_ACCOUNT_ERROR, { status: 409 })
            }
            throw err
        }

        // --- Consume OTP so it cannot be reused ---
        await Otp.deleteOne({ _id: otpRecord._id })

        // --- Return the raw apiKey to the user ONCE ---
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

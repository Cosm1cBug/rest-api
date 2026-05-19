import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import Otp from '@/models/otp.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { registerSchema } from '@/lib/validators/auth.js'

const BCRYPT_ROUNDS = 12

/**
 * Generates a new API key in the format `keyId.secret`.
 * keyId   - stored plaintext, used for DB lookup
 * secret  - returned once to the user; only its bcrypt hash is stored
 */
async function generateApiKey() {
    const keyId = crypto.randomBytes(8).toString('hex')       // 16 hex chars
    const secret = crypto.randomBytes(24).toString('hex')     // 48 hex chars
    const keyHash = await bcrypt.hash(secret, BCRYPT_ROUNDS)
    const apiKey = `${keyId}.${secret}`
    return { keyId, keyHash, apiKey }
}

export async function POST(req) {
    try {
        const body = await req.json()
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

        const normalizedEmail = email.toLowerCase().trim()

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

        // --- Constant-time code comparison to prevent timing attacks ---
        const expected = Buffer.from(otpRecord.code)
        const received = Buffer.from(otpCode)
        const codesMatch = expected.length === received.length && crypto.timingSafeEqual(expected, received)

        if (!codesMatch) {
            return Response.json(
                { success: false, message: 'Invalid OTP.' },
                { status: 400 }
            )
        }

        // --- Check for duplicate username / email before creating ---
        const [emailTaken, usernameTaken] = await Promise.all([
            User.exists({ email: normalizedEmail }),
            User.exists({ username: parsed.data.username })
        ])

        if (emailTaken) {
            return Response.json(
                { success: false, message: 'This email is already registered.' },
                { status: 409 }
            )
        }

        if (usernameTaken) {
            return Response.json(
                { success: false, message: 'This username is already taken.' },
                { status: 409 }
            )
        }

        // --- Hash password and generate API key ---
        const [passwordHash, { keyId, keyHash, apiKey }] = await Promise.all([
            bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
            generateApiKey()
        ])

        // --- Create user ---
        await User.create({
            username: parsed.data.username,
            email: normalizedEmail,
            password: passwordHash,
            keyId,
            keyHash,
            apiKey,
            status: 'basic'
        })

        // --- Consume OTP so it cannot be reused ---
        await Otp.deleteOne({ _id: otpRecord._id })

        return Response.json(
            {
                success: true,
                message: 'Account created successfully. You can now sign in.'
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
import connectDB from '@/lib/mongodb.js'
import ApiKey from '@/models/apiKey.js'
import User from '@/models/user.js'
import { requireSession } from '@/lib/auth/requireSession.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { issueApiKey } from '@/lib/auth/apiKeys.js'
import { z } from 'zod'

const MAX_KEYS_PER_USER = 10 

const createSchema = z.object({
    label: z.string().trim().max(64).optional()
}).strict()

// ---------------------------------------------------------------------- GET
export async function GET(req) {
    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    await connectDB()

    const keys = await ApiKey.find({ userId: guard.token.id })
        .select('keyId label createdAt lastUsedAt revoked revokedAt')
        .sort({ createdAt: -1 })
        .lean()

    const user = await User.findById(guard.token.id).select('keyId').lean()
    const synthetic = (user?.keyId && !keys.find(k => k.keyId === user.keyId))
        ? [{
            keyId: user.keyId,
            label: '(legacy)',
            createdAt: null,
            lastUsedAt: null,
            revoked: false,
            revokedAt: null,
            legacy: true
        }]
        : []

    return Response.json(
        {
            success: true,
            keys: [...keys, ...synthetic].map(k => ({
                keyId: k.keyId,
                label: k.label || '',
                createdAt: k.createdAt,
                lastUsedAt: k.lastUsedAt,
                revoked: k.revoked,
                revokedAt: k.revokedAt,
                legacy: !!k.legacy
            }))
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

// --------------------------------------------------------------------- POST
export async function POST(req) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    let body = {}
    try {
        body = await req.json()
    } catch {
        // empty body is fine — label is optional
    }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || 'Invalid input.'
        return Response.json({ success: false, message }, { status: 400 })
    }

    await connectDB()

    // Cap active (non-revoked) keys per user.
    const active = await ApiKey.countDocuments({
        userId: guard.token.id,
        revoked: false
    })
    if (active >= MAX_KEYS_PER_USER) {
        return Response.json(
            {
                success: false,
                message: `You already have ${MAX_KEYS_PER_USER} active keys. Revoke one before issuing another.`
            },
            { status: 409 }
        )
    }

    const { apiKey, keyId, label, createdAt } = await issueApiKey(
        guard.token.id,
        { label: parsed.data.label }
    )

    return Response.json(
        {
            success: true,
            message: 'API key created. Save it now — it will not be shown again.',
            apiKey,
            keyId,
            label,
            createdAt
        },
        {
            status: 201,
            headers: { 'Cache-Control': 'private, no-store' }
        }
    )
}

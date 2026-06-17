import connectDB from '@/lib/mongodb.js'
import ApiKey from '@/models/apiKey.js'
import User from '@/models/user.js'
import { requireSession } from '@/lib/auth/requireSession.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { issueApiKey } from '@/lib/auth/apiKeys.js'
import { VALID_SCOPES, normaliseScopes } from '@/lib/auth/apiKeyScopes.js'
import { z } from 'zod'

const MAX_KEYS_PER_USER = 10

// Allow up to 1 year of validity. Longer keys are an anti-pattern;
// users should rotate them.
const MAX_EXPIRY_DAYS = 365

const createSchema = z.object({
    label:     z.string().trim().max(64).optional(),
    scopes:    z.array(z.string().max(32)).max(10).optional(),
    // Either a future ISO datetime, or null/omitted for never-expires.
    expiresAt: z.union([z.string().datetime(), z.null()]).optional()
}).strict()

// ---------------------------------------------------------------------- GET
/**
 * @openapi
 * /api/user/api-keys:
 *   get:
 *     tags: [User]
 *     summary: List own API keys (active and revoked)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200:
 *         description: Caller's keys.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 keys:    { type: array, items: { $ref: '#/components/schemas/ApiKeyDto' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
export async function GET(req) {
    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    await connectDB()

    const keys = await ApiKey.find({ userId: guard.token.id })
        .select('keyId label scopes expiresAt createdAt lastUsedAt revoked revokedAt')
        .sort({ createdAt: -1 })
        .lean()

    // Legacy key carried inline on the User document — surface it so
    // pre-Stage-3 users can still see and revoke it.
    const user = await User.findById(guard.token.id).select('keyId').lean()
    const synthetic = (user?.keyId && !keys.find(k => k.keyId === user.keyId))
        ? [{
            keyId: user.keyId,
            label: '(legacy)',
            scopes: [],
            expiresAt: null,
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
                keyId:      k.keyId,
                label:      k.label || '',
                scopes:     k.scopes || [],
                expiresAt:  k.expiresAt || null,
                createdAt:  k.createdAt,
                lastUsedAt: k.lastUsedAt,
                revoked:    k.revoked,
                revokedAt:  k.revokedAt,
                legacy:     !!k.legacy
            })),
            availableScopes: [...VALID_SCOPES]
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

// --------------------------------------------------------------------- POST
/**
 * @openapi
 * /api/user/api-keys:
 *   post:
 *     tags: [User]
 *     summary: Issue a new API key (returns plaintext ONCE)
 *     description: |
 *       Generates a `keyId.secret` pair; only the bcrypt hash of `secret` is
 *       stored server-side. The plaintext `apiKey` is returned in this response
 *       and is never recoverable afterwards.
 *     security:
 *       - SessionCookie: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:     { type: string, maxLength: 64 }
 *               scopes:    { type: array, items: { type: string, enum: [github, uploads] } }
 *               expiresAt: { type: string, format: date-time, nullable: true }
 *     responses:
 *       201:
 *         description: Key issued.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiKeyIssueResponse' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
export async function POST(req) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    let body = {}
    try {
        body = await req.json()
    } catch {
        // empty body is fine — every field is optional
    }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || 'Invalid input.'
        return Response.json({ success: false, message }, { status: 400 })
    }

    // Validate scopes against the canonical list. We do this AFTER the
    // shape check (which catches type errors) so error messages are
    // about names rather than types.
    const scopeCheck = normaliseScopes(parsed.data.scopes)
    if (!scopeCheck.ok) {
        return Response.json(
            { success: false, message: scopeCheck.message },
            { status: 400 }
        )
    }

    // Validate expiresAt: must be in the future and within MAX_EXPIRY_DAYS.
    let expiresAt = null
    if (parsed.data.expiresAt) {
        const d = new Date(parsed.data.expiresAt)
        const now = Date.now()
        const maxFuture = now + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        if (Number.isNaN(d.getTime()) || d.getTime() <= now) {
            return Response.json(
                { success: false, message: 'expiresAt must be a future ISO datetime.' },
                { status: 400 }
            )
        }
        if (d.getTime() > maxFuture) {
            return Response.json(
                { success: false, message: `expiresAt cannot be more than ${MAX_EXPIRY_DAYS} days in the future.` },
                { status: 400 }
            )
        }
        expiresAt = d
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

    const issued = await issueApiKey(guard.token.id, {
        label:     parsed.data.label,
        scopes:    scopeCheck.scopes,
        expiresAt
    })

    return Response.json(
        {
            success: true,
            message:   'API key created. Save it now — it will not be shown again.',
            apiKey:    issued.apiKey,
            keyId:     issued.keyId,
            label:     issued.label,
            scopes:    issued.scopes,
            expiresAt: issued.expiresAt,
            createdAt: issued.createdAt
        },
        {
            status: 201,
            headers: { 'Cache-Control': 'private, no-store' }
        }
    )
}

import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import ApiKey from '@/models/apiKey.js'
import { requireAdmin, requireAdminWithToken } from '@/lib/auth/requireAdmin.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { adminUserPatchSchema } from '@/lib/validators/admin.js'
import { writeAudit } from '@/lib/audit.js'

/**
 * GET    /api/admin/users/[id]   — single user detail (admin only)
 * PATCH  /api/admin/users/[id]   — mutate role / disabled / endDate
 *
 * Notes:
 *   - Admin cannot change their own role or disable themselves through
 *     this endpoint. A self-lockout would leave the system without an
 *     admin.
 *   - All changes are written to the audit log with before/after diffs.
 *   - Re-enabling a user also clears their lockout state so they can
 *     log in immediately.
 *   - Sensitive fields (password, keyHash) cannot be mutated here —
 *     adminUserPatchSchema is .strict() and rejects unknown keys.
 */

function isValidObjectId(s) {
    return typeof s === 'string' && mongoose.Types.ObjectId.isValid(s)
}

async function fetchUserSafe(id) {
    return User.findById(id)
        .select('username email role disabled image endDate failedLoginAttempts lockUntil createdAt oauthProviders oauthProfile emailVerifiedAt')
        .lean()
}

// ------------------------------------------------------------------ GET
/**
 * @openapi
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Single user detail (extended — OAuth fields + recent API keys)
 *     description: |
 *       Returns the user document plus V11 OAuth fields (oauthProviders,
 *       oauthProfile, emailVerifiedAt) and the 10 most recent API keys.
 *       Powers the V13 admin detail page at /admin/users/[id].
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, description: MongoDB ObjectId. }
 *     responses:
 *       200:
 *         description: User detail.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 user:
 *                   allOf:
 *                     - { $ref: '#/components/schemas/UserDto' }
 *                     - type: object
 *                       properties:
 *                         apiKeys: { type: array, items: { $ref: '#/components/schemas/ApiKeyDto' } }
 *       400: { description: Invalid ObjectId. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
export async function GET(req, ctx) {
    const denied = await requireAdmin(req)
    if (denied) return denied

    const { id } = await ctx.params
    if (!isValidObjectId(id)) {
        return Response.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    await connectDB()

    const [user, activeKeyCount, recentKeys] = await Promise.all([
        fetchUserSafe(id),
        ApiKey.countDocuments({ userId: id, revoked: false }),
        // Return the 10 most recent keys (active or revoked) so the
        // admin detail page can show key labels + lastUsedAt without
        // making a second round trip. Capped at 10 to keep the response
        // small even for power users.
        ApiKey.find({ userId: id })
            .select('keyId label scopes expiresAt lastUsedAt revoked createdAt')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean()
    ])

    if (!user) {
        return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // OAuthProfile is a Mongo Map; .lean() returns it as a plain object
    // on modern Mongoose but older versions may return a Map — normalise.
    const profile = user.oauthProfile instanceof Map
        ? Object.fromEntries(user.oauthProfile)
        : (user.oauthProfile || {})

    return Response.json(
        {
            success: true,
            user: {
                id: user._id.toString(),
                username: user.username,
                email: user.email,
                role: user.role || 'basic',
                disabled: !!user.disabled,
                image: user.image,
                endDate: user.endDate || null,
                failedLoginAttempts: user.failedLoginAttempts || 0,
                lockedUntil: user.lockUntil || null,
                createdAt: user.createdAt,
                // V11 OAuth fields
                oauthProviders: user.oauthProviders || [],
                oauthProfile: profile,
                emailVerifiedAt: user.emailVerifiedAt || null,
                // Active key count + recent keys
                apiKeysActive: activeKeyCount,
                apiKeys: recentKeys.map(k => ({
                    keyId: k.keyId,
                    label: k.label || '',
                    scopes: k.scopes || [],
                    expiresAt: k.expiresAt || null,
                    lastUsedAt: k.lastUsedAt || null,
                    revoked: !!k.revoked,
                    createdAt: k.createdAt
                }))
            }
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

// ---------------------------------------------------------------- PATCH
/**
 * @openapi
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Mutate role / disabled / endDate (self-modification guards enforced)
 *     description: |
 *       Admin cannot change their own role or disable themselves through this
 *       endpoint (would leave the system without an admin). Re-enabling a user
 *       also clears their lockout state. Sensitive fields (password, keyHash)
 *       are rejected by the strict Zod schema. All changes go to audit log + SIEM.
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:     { type: string, enum: [basic, standard, premium, admin] }
 *               disabled: { type: boolean }
 *               endDate:  { type: string, format: date-time, nullable: true }
 *     responses:
 *       200: { description: User updated. }
 *       400: { description: Invalid input or self-modification attempt. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
export async function PATCH(req, ctx) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    const { token, response } = await requireAdminWithToken(req)
    if (response) return response

    const { id } = await ctx.params
    if (!isValidObjectId(id)) {
        return Response.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    let body
    try { body = await req.json() } catch {
        return Response.json({ success: false, message: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = adminUserPatchSchema.safeParse(body)
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || 'Invalid input'
        return Response.json({ success: false, message }, { status: 400 })
    }

    await connectDB()

    const before = await fetchUserSafe(id)
    if (!before) {
        return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // --- Self-modification guard ---
    const isSelf = String(before._id) === String(token.id)

    if (isSelf) {
        if (parsed.data.role && parsed.data.role !== before.role) {
            return Response.json(
                { success: false, message: 'You cannot change your own role.' },
                { status: 400 }
            )
        }
        if (parsed.data.disabled === true) {
            return Response.json(
                { success: false, message: 'You cannot disable your own account.' },
                { status: 400 }
            )
        }
    }

    // --- Build the update doc ---
    const $set = {}
    const $unset = {}

    if ('role' in parsed.data && parsed.data.role !== undefined) {
        $set.role = parsed.data.role
    }
    if ('disabled' in parsed.data && parsed.data.disabled !== undefined) {
        $set.disabled = parsed.data.disabled
        // Re-enabling? Also clear any lockout so the user can log in
        // immediately (otherwise they'd hit the lockout from before
        // they were disabled).
        if (parsed.data.disabled === false) {
            $set.failedLoginAttempts = 0
            $set.lockUntil = null
        }
    }
    if ('endDate' in parsed.data) {
        if (parsed.data.endDate === null) $unset.endDate = ''
        else $set.endDate = new Date(parsed.data.endDate)
    }

    const update = {}
    if (Object.keys($set).length) update.$set = $set
    if (Object.keys($unset).length) update.$unset = $unset

    await User.updateOne({ _id: id }, update)
    const after = await fetchUserSafe(id)

    // --- Audit ---
    // Diff only the keys we actually touched so the log row is small.
    const touched = Object.keys({ ...$set, ...$unset })
    const diff = (doc) => Object.fromEntries(touched.map(k => [k, doc?.[k] ?? null]))

    await writeAudit({
        req,
        actor: { id: token.id, email: token.email || token.name },
        action: 'user.update',
        target: { id: before._id, label: before.email },
        before: diff(before),
        after: diff(after)
    })

    return Response.json(
        {
            success: true,
            user: {
                id: after._id.toString(),
                username: after.username,
                email: after.email,
                role: after.role || 'basic',
                disabled: !!after.disabled,
                endDate: after.endDate || null,
                failedLoginAttempts: after.failedLoginAttempts || 0,
                lockedUntil: after.lockUntil || null
            }
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

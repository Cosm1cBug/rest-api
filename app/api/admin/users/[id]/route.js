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
        .select('username email role disabled image endDate failedLoginAttempts lockUntil createdAt')
        .lean()
}

// ------------------------------------------------------------------ GET
export async function GET(req, ctx) {
    const denied = await requireAdmin(req)
    if (denied) return denied

    const { id } = await ctx.params
    if (!isValidObjectId(id)) {
        return Response.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    await connectDB()

    const [user, activeKeyCount] = await Promise.all([
        fetchUserSafe(id),
        ApiKey.countDocuments({ userId: id, revoked: false })
    ])

    if (!user) {
        return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

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
                apiKeysActive: activeKeyCount
            }
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

// ---------------------------------------------------------------- PATCH
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

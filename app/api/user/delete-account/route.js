import bcrypt from 'bcryptjs'
import { z } from 'zod'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import ApiKey from '@/models/apiKey.js'
import Otp from '@/models/otp.js'
import PasswordReset from '@/models/passwordReset.js'
import { requireSession } from '@/lib/auth/requireSession.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { writeAudit } from '@/lib/audit.js'

const schema = z.object({
    currentPassword: z.string().min(1).max(100),
    confirm:         z.literal('DELETE')
}).strict()

/**
 * @openapi
 * /api/user/delete-account:
 *   delete:
 *     tags: [User]
 *     summary: Delete own account (irreversible)
 *     description: |
 *       Cascades: revokes all of the caller's API keys, writes a final audit
 *       entry (mirrored to SIEM if configured), then removes the user document.
 *       Cannot be undone.
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Account deleted. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
export async function DELETE(req) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    let body
    try {
        body = await req.json()
    } catch {
        return Response.json(
            { success: false, message: 'Invalid JSON' },
            { status: 400 }
        )
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        const err = parsed.error.errors[0]
        const message = err?.path?.[0] === 'confirm'
            ? 'You must include {"confirm": "DELETE"} to delete your account.'
            : (err?.message || 'Invalid input')
        return Response.json({ success: false, message }, { status: 400 })
    }

    await connectDB()

    const user = await User.findById(guard.token.id).select('email password username role status')
    if (!user) {
        return Response.json(
            { success: false, message: 'User not found' },
            { status: 404 }
        )
    }

    if (!user.password) {
        return Response.json(
            { success: false, message: 'Account deletion via password is not available for this account.' },
            { status: 400 }
        )
    }

    const ok = await bcrypt.compare(parsed.data.currentPassword, user.password)
    if (!ok) {
        return Response.json(
            { success: false, message: 'Current password is incorrect.' },
            { status: 400 }
        )
    }

    // --- Cascade delete ---
    const userId = user._id
    const userEmail = user.email

    try {
        await ApiKey.deleteMany({ userId })
        await Otp.deleteMany({ email: userEmail })
        await PasswordReset.deleteMany({ userId })
        await User.deleteOne({ _id: userId })
    } catch (err) {
        console.error('[delete-account] cascade failed:', err)
        return Response.json(
            { success: false, message: 'Could not delete account. Please try again.' },
            { status: 500 }
        )
    }

    // --- Audit ---
    // The actor is the user themselves; the target is also themselves.
    // writeAudit is fire-and-forget but we await it here so the audit
    // row is committed before the response goes back — for self-delete
    // we want strong durability.
    await writeAudit({
        req,
        actor: {
            id: userId.toString(),
            email: userEmail
        },
        action: 'user.self_delete',
        target: {
            id: userId,
            label: userEmail
        },
        before: {
            username: user.username,
            email: userEmail,
            role: user.role || user.status || 'basic'
        },
        after: { deleted: true }
    })

    // The session cookie remains in the browser; next request that
    // hits requireSession will load the token but User.findById will
    // return null, and the route returns 401. We don't try to clear
    // the cookie server-side — the client should call signOut().
    return Response.json(
        {
            success: true,
            message: 'Account deleted. Goodbye.'
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

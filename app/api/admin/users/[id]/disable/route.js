import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import { requireAdminWithToken } from '@/lib/auth/requireAdmin.js'
import { writeAudit } from '@/lib/audit.js'

/**
 * @openapi
 * /api/admin/users/{id}/disable:
 *   post:
 *     tags: [Admin]
 *     summary: Disable a user account (one-shot, audit logged)
 *     description: 'Convenience endpoint equivalent to PATCH with `{ disabled: true }`. Admin cannot disable themselves.'
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Account disabled. }
 *       400: { description: Attempted self-disable. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
export async function POST(req, ctx) {
    const { token, response } = await requireAdminWithToken(req)
    if (response) return response

    const { id } = await ctx.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return Response.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    if (String(id) === String(token.id)) {
        return Response.json(
            { success: false, message: 'You cannot disable your own account.' },
            { status: 400 }
        )
    }

    await connectDB()

    const before = await User.findById(id).select('email disabled').lean()
    if (!before) {
        return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    if (before.disabled) {
        // Already disabled — return success but skip the audit row so we
        // don't flood the log with no-op clicks.
        return Response.json({ success: true, alreadyDisabled: true })
    }

    await User.updateOne({ _id: id }, { $set: { disabled: true } })

    await writeAudit({
        req,
        actor: { id: token.id, email: token.email || token.name },
        action: 'user.disable',
        target: { id: before._id, label: before.email },
        before: { disabled: false },
        after: { disabled: true }
    })

    return Response.json({ success: true, message: 'Account disabled.' })
}

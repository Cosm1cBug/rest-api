import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import ApiKey from '@/models/apiKey.js'
import { requireAdminWithToken } from '@/lib/auth/requireAdmin.js'
import { writeAudit } from '@/lib/audit.js'

/**
 * @openapi
 * /api/admin/users/{id}/api-keys/{keyId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Admin-side API key revoke (any user)
 *     security:
 *       - SessionCookie: []
 *     parameters:
 *       - { in: path, name: id,    required: true, schema: { type: string }, description: User ObjectId. }
 *       - { in: path, name: keyId, required: true, schema: { type: string }, description: Public 16-hex key prefix. }
 *     responses:
 *       200: { description: Key revoked. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: User or key not found. }
 */
export async function DELETE(req, ctx) {
    const { token, response } = await requireAdminWithToken(req)
    if (response) return response

    const { id, keyId } = await ctx.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return Response.json({ success: false, error: 'Invalid user id' }, { status: 400 })
    }
    if (!/^[a-f0-9]{16}$/.test(String(keyId))) {
        return Response.json({ success: false, error: 'Invalid keyId' }, { status: 400 })
    }

    await connectDB()

    const targetUser = await User.findById(id).select('email keyId').lean()
    if (!targetUser) {
        return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // --- 1. Try the new ApiKey collection ---
    const record = await ApiKey.findOne({ keyId: String(keyId), userId: id })

    if (record) {
        if (record.revoked) {
            return Response.json(
                { success: false, message: 'Key already revoked.' },
                { status: 409 }
            )
        }
        record.revoked = true
        record.revokedAt = new Date()
        await record.save()

        await writeAudit({
            req,
            actor: { id: token.id, email: token.email || token.name },
            action: 'user.apikey_revoke',
            target: { id: targetUser._id, label: targetUser.email },
            before: { keyId, revoked: false },
            after: { keyId, revoked: true }
        })

        return Response.json({ success: true, message: 'API key revoked.' })
    }

    // --- 2. Legacy fallback ---
    if (targetUser.keyId === String(keyId)) {
        await User.updateOne(
            { _id: id },
            { $unset: { keyId: '', keyHash: '' } }
        )

        await writeAudit({
            req,
            actor: { id: token.id, email: token.email || token.name },
            action: 'user.apikey_revoke',
            target: { id: targetUser._id, label: targetUser.email },
            before: { keyId, legacy: true },
            after: { keyId, legacy: true, revoked: true }
        })

        return Response.json({ success: true, message: 'Legacy API key revoked.' })
    }

    return Response.json({ success: false, error: 'Key not found' }, { status: 404 })
}

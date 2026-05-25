import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import { requireAdminWithToken } from '@/lib/auth/requireAdmin.js'
import { writeAudit } from '@/lib/audit.js'

export async function POST(req, ctx) {
    const { token, response } = await requireAdminWithToken(req)
    if (response) return response

    const { id } = await ctx.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return Response.json({ success: false, error: 'Invalid id' }, { status: 400 })
    }

    await connectDB()

    const before = await User.findById(id)
        .select('email disabled failedLoginAttempts lockUntil')
        .lean()

    if (!before) {
        return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const wasLocked = (before.failedLoginAttempts || 0) > 0
        || (before.lockUntil && new Date(before.lockUntil).getTime() > Date.now())

    if (!before.disabled && !wasLocked) {
        return Response.json({ success: true, alreadyEnabled: true })
    }

    await User.updateOne({ _id: id }, {
        $set: {
            disabled: false,
            failedLoginAttempts: 0,
            lockUntil: null
        }
    })

    await writeAudit({
        req,
        actor: { id: token.id, email: token.email || token.name },
        action: 'user.enable',
        target: { id: before._id, label: before.email },
        before: {
            disabled: before.disabled,
            failedLoginAttempts: before.failedLoginAttempts || 0,
            lockUntil: before.lockUntil || null
        },
        after: {
            disabled: false,
            failedLoginAttempts: 0,
            lockUntil: null
        }
    })

    return Response.json({ success: true, message: 'Account enabled and lockout cleared.' })
}

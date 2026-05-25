import { z } from 'zod'
import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb.js'
import AuditLog from '@/models/auditLog.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

const querySchema = z.object({
    actorId: z.string().optional(),
    targetId: z.string().optional(),
    action: z.string().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25)
}).strict()

function safeId(s) {
    return mongoose.Types.ObjectId.isValid(s) ? s : null
}

export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()))
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || 'Invalid query'
        return Response.json({ success: false, message }, { status: 400 })
    }

    const { actorId, targetId, action, page, limit } = parsed.data

    const filter = {}
    if (actorId) {
        const id = safeId(actorId)
        if (!id) return Response.json({ success: false, error: 'Invalid actorId' }, { status: 400 })
        filter.actorId = id
    }
    if (targetId) {
        const id = safeId(targetId)
        if (!id) return Response.json({ success: false, error: 'Invalid targetId' }, { status: 400 })
        filter.targetId = id
    }
    if (action) filter.action = action

    await connectDB()

    const skip = (page - 1) * limit
    const [total, entries] = await Promise.all([
        AuditLog.countDocuments(filter),
        AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
    ])

    return Response.json(
        {
            success: true,
            total,
            page,
            limit,
            pages: Math.max(1, Math.ceil(total / limit)),
            entries: entries.map(e => ({
                id: e._id.toString(),
                actorId: e.actorId?.toString() || null,
                actorEmail: e.actorEmail,
                action: e.action,
                targetType: e.targetType,
                targetId: e.targetId?.toString() || null,
                targetLabel: e.targetLabel,
                before: e.before,
                after: e.after,
                ip: e.ip,
                userAgent: e.userAgent,
                createdAt: e.createdAt
            }))
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

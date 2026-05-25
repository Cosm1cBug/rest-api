import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'
import { adminUserListQuerySchema } from '@/lib/validators/admin.js'

export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    // --- Parse query ---
    const { searchParams } = new URL(req.url)
    const raw = Object.fromEntries(searchParams.entries())
    const parsed = adminUserListQuerySchema.safeParse(raw)
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || 'Invalid query'
        return Response.json({ success: false, message }, { status: 400 })
    }

    const { q, role, disabled, page, limit } = parsed.data

    // --- Build Mongo filter ---
    const filter = {}

    if (q) {
        // Escape regex meta-characters so user input cannot be a regex DoS vector.
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        filter.$or = [
            { username: { $regex: safe, $options: 'i' } },
            { email:    { $regex: safe, $options: 'i' } }
        ]
    }

    if (role) filter.role = role
    if (disabled === 'true') filter.disabled = true
    if (disabled === 'false') filter.disabled = { $ne: true }

    await connectDB()

    const skip = (page - 1) * limit

    // Run count + slice in parallel for low latency.
    const [total, users] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter)
            .select('username email role disabled image endDate failedLoginAttempts lockUntil createdAt')
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
            users: users.map(u => ({
                id: u._id.toString(),
                username: u.username,
                email: u.email,
                role: u.role || 'basic',
                disabled: !!u.disabled,
                image: u.image,
                endDate: u.endDate || null,
                failedLoginAttempts: u.failedLoginAttempts || 0,
                lockedUntil: u.lockUntil || null,
                createdAt: u.createdAt
            }))
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

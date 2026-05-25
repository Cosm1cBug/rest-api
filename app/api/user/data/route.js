import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import ApiKey from '@/models/apiKey.js'
import { requireSession } from '@/lib/auth/requireSession.js'

export async function GET(req) {

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    await connectDB()

    const [user, activeKeyCount] = await Promise.all([
        User.findById(guard.token.id)
            .select('username email role status image disabled endDate request_today request_all createdAt')
            .lean(),
        ApiKey.countDocuments({ userId: guard.token.id, revoked: false })
    ])

    if (!user) {
        return Response.json(
            { success: false, error: 'User not found' },
            { status: 404 }
        )
    }

    if (user.disabled) {
        return Response.json(
            { success: false, error: 'Account disabled' },
            { status: 403 }
        )
    }

    return Response.json(
        {
            success: true,
            user: {
                id: user._id.toString(),
                username: user.username,
                email: user.email,
                role: user.role || user.status || 'basic',
                image: user.image,
                endDate: user.endDate || null,
                requestToday: user.request_today || 0,
                requestAll: user.request_all || 0,
                createdAt: user.createdAt,
                apiKeysActive: activeKeyCount
            }
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

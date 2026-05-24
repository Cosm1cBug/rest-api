import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import { requireSession } from '@/lib/auth/requireSession.js'

export async function GET(req) {

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    await connectDB()

    // Explicit field projection — safer than relying on toJSON transforms
    // because new sensitive fields added later would otherwise leak by default.
    const user = await User.findById(guard.token.id)
        .select('username email role status image keyId disabled endDate request_today request_all createdAt')
        .lean()

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
                keyId: user.keyId || null,           // safe to show — keyId is a lookup handle, not a credential
                endDate: user.endDate || null,
                requestToday: user.request_today || 0,
                requestAll: user.request_all || 0,
                createdAt: user.createdAt
            }
        },
        {
            headers: {
                // Never let a shared cache hold an authenticated response.
                'Cache-Control': 'private, no-store'
            }
        }
    )
}

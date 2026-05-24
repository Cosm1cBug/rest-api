import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import { requireSession } from '@/lib/auth/requireSession.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { userUpdateSchema } from '@/lib/validators/user.js'

export async function POST(req) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    let body
    try {
        body = await req.json()
    } catch {
        return Response.json(
            { success: false, error: 'Invalid JSON body' },
            { status: 400 }
        )
    }

    const parsed = userUpdateSchema.safeParse(body)
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || 'Invalid input.'
        return Response.json({ success: false, message }, { status: 400 })
    }

    // Nothing to do
    if (Object.keys(parsed.data).length === 0) {
        return Response.json(
            { success: false, message: 'No updatable fields provided.' },
            { status: 400 }
        )
    }

    await connectDB()

    try {
        const updated = await User.findByIdAndUpdate(
            guard.token.id,
            { $set: parsed.data },
            { new: true, runValidators: true }
        ).select('username email role image').lean()

        if (!updated) {
            return Response.json(
                { success: false, error: 'User not found' },
                { status: 404 }
            )
        }

        return Response.json(
            {
                success: true,
                user: {
                    id: updated._id.toString(),
                    username: updated.username,
                    email: updated.email,
                    role: updated.role || 'basic',
                    image: updated.image
                }
            },
            { headers: { 'Cache-Control': 'private, no-store' } }
        )
    } catch (err) {
        // Unique index violation on username.
        if (err && err.code === 11000) {
            return Response.json(
                { success: false, message: 'That username is already taken.' },
                { status: 409 }
            )
        }
        console.error('[user/update] Error:', err)
        return Response.json(
            { success: false, error: 'Could not update profile' },
            { status: 500 }
        )
    }
}

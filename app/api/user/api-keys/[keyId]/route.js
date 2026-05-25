import connectDB from '@/lib/mongodb.js'
import ApiKey from '@/models/apiKey.js'
import User from '@/models/user.js'
import { requireSession } from '@/lib/auth/requireSession.js'

export async function DELETE(req, ctx) {
    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    const { keyId } = await ctx.params

    if (!/^[a-f0-9]{16}$/.test(String(keyId))) {
        return Response.json(
            { success: false, error: 'Invalid keyId' },
            { status: 400 }
        )
    }

    await connectDB()

    const record = await ApiKey.findOne({
        keyId: String(keyId),
        userId: guard.token.id  
    })

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
        return Response.json({ success: true, message: 'API key revoked.' })
    }

    const user = await User.findOne({
        _id: guard.token.id,
        keyId: String(keyId)
    })

    if (user) {
        user.keyId = undefined
        user.keyHash = undefined
        await user.save()
        return Response.json({ success: true, message: 'Legacy API key revoked.' })
    }

    return Response.json(
        { success: false, error: 'Key not found' },
        { status: 404 }
    )
}

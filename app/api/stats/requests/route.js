import connectDB from '@/lib/mongodb.js'
import ApiLog from '@/models/apiLog.js'
import { requireSession } from '@/lib/auth/requireSession.js'

export async function GET(req) {

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    await connectDB()

    const userId = guard.token.id
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [hourly, last24h, last7d, allTime] = await Promise.all([
        ApiLog.aggregate([
            { $match: { userId, createdAt: { $gte: dayAgo } } },
            {
                $group: {
                    _id: { $hour: '$createdAt' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, hour: '$_id', count: 1 } }
        ]),
        ApiLog.countDocuments({ userId, createdAt: { $gte: dayAgo } }),
        ApiLog.countDocuments({ userId, createdAt: { $gte: weekAgo } }),
        ApiLog.countDocuments({ userId })
    ])

    return Response.json(
        {
            success: true,
            totals: { last24h, last7d, allTime },
            hourly
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

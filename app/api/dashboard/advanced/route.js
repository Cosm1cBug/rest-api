import ApiLog from '@/models/apiLog.js'
import connectDB from '@/lib/mongodb.js'
import { dashboardRateLimit } from '@/lib/middleware/adminRateLimit'
import { requireAdmin } from '@/lib/auth/requireAdmin.js' 

/**
 * @openapi
 * /api/dashboard/advanced:
 *   get:
 *     tags: [Dashboard]
 *     summary: Advanced dashboard data (latency heatmaps, error rates)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Dashboard payload. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'

    const { success } = await dashboardRateLimit.limit(ip)

    if (!success) {
        return Response.json({
            error: 'Too many requests'
        },
        {
            status: 429
        })
    }

    await connectDB()

    const now = new Date()

    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [
        hourlyHits,
        latencyHeatmap,
        geoAnalytics,
        ipAnalytics,
        cacheStats,
        activeUsers
    ] = await Promise.all([
        ApiLog.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: last24Hours
                    }
                }
            },
            {
                $group: {
                    _id: {
                        hour: {
                            $hour: '$createdAt'
                        }
                    },
                    count: {
                        $sum: 1
                    }
                }
            },
            {
                $sort: {
                    '_id.hour': 1
                }
            }
        ]),

        ApiLog.aggregate([
            {
                $group: {
                    _id: '$endpoint',
                    avgLatency: {
                        $avg: '$latency'
                    }
                }
            },
            {
                $sort: {
                    avgLatency: -1
                }
            }
        ]),

        ApiLog.aggregate([
            {
                $group: {
                    _id: '$country',
                    count: {
                        $sum: 1
                    }
                }
            },
            {
                $sort: {
                    count: -1
                }
            }
        ]),

        ApiLog.aggregate([
            {
                $group: {
                    _id: '$ip',
                    count: {
                        $sum: 1
                    }
                }
            },
            {
                $sort: {
                    count: -1
                }
            },
            {
                $limit: 20
            }
        ]),

        ApiLog.aggregate([
            {
                $group: {
                    _id: '$cacheHit',
                    count: {
                        $sum: 1
                    }
                }
            }
        ]),

        ApiLog.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: last24Hours
                    }
                }
            },
            {
                $group: {
                    _id: '$userId'
                }
            },
            {
                $count: 'activeUsers'
            }
        ])
    ])
    
    return Response.json({
        hourlyHits,
        latencyHeatmap,
        geoAnalytics,
        ipAnalytics,
        cacheStats,
        activeUsers: activeUsers[0]?.activeUsers || 0
    })
}
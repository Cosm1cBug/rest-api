import ApiLog from '@/models/apiLog'
import connectDB from '@/lib/mongodb'

export async function GET() {

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
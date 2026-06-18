import ApiLog from '@/models/apiLog.js'
import connectDB from '@/lib/mongodb.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

/**
 * @openapi
 * /api/dashboard/charts:
 *   get:
 *     tags: [Dashboard]
 *     summary: Hourly traffic charts (last 24h)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Chart series. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied
    
    await connectDB()

    const hourly = await ApiLog.aggregate([
        {
            $group: {
                _id: {
                    hour: {
                        $hour: '$createdAt'
                    }
                },
                requests: {
                    $sum: 1
                },
                avgLatency: {
                    $avg: '$duration'
                }
            }
        },
        {
            $sort: {
                '_id.hour': 1
            }
        }
    ])

    return Response.json({ hourly })
}
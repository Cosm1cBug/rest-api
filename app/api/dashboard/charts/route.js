import ApiLog from '@/models/apiLog.js'
import connectDB from '@/lib/mongodb.js'

export async function GET() {

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
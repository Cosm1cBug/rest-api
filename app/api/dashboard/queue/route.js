import { scraperQueue } from '@/lib/bullmq.js'
import { getQueueStats } from '@/lib/queueTelemetry.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

/**
 * @openapi
 * /api/dashboard/queue:
 *   get:
 *     tags: [Dashboard]
 *     summary: BullMQ queue state (waiting / active / completed / failed counts)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Queue summary. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied
    
    const counts = await scraperQueue.getJobCounts()

    return Response.json({
        ...counts,
        telemetry: getQueueStats()
    })
}
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

/**
 * @openapi
 * /api/dashboard/workers:
 *   get:
 *     tags: [Dashboard]
 *     summary: BullMQ worker health (heartbeat, last-job timestamps)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Worker statuses. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export async function GET(req) {
    
    const denied = await requireAdmin(req)
    if (denied) return denied
    
    return Response.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        pid: process.pid
    })
}
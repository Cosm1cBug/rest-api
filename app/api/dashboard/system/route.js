import os from 'os'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

/**
 * @openapi
 * /api/dashboard/system:
 *   get:
 *     tags: [Dashboard]
 *     summary: System info (Node version, env, build info)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: System payload. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    return Response.json({

        cpuLoad: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        platform: os.platform(),
        cpus: os.cpus().length
    })
}
import { getTelemetry } from '@/lib/telemetry.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

/**
 * @openapi
 * /api/dashboard/telemetry:
 *   get:
 *     tags: [Dashboard]
 *     summary: Live telemetry (per-endpoint counters, sliding window)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Telemetry payload. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export async function GET() {
    
    const denied = await requireAdmin(req)
    if (denied) return denied

    return Response.json(
        getTelemetry()
    )
}

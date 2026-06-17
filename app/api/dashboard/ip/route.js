import { getTopIPs } from '@/lib/ipAnalytics.js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

/**
 * @openapi
 * /api/dashboard/ip:
 *   get:
 *     tags: [Dashboard]
 *     summary: IP analytics (top sources by volume; geo breakdown)
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Per-IP stats. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    const topIPs = await getTopIPs()

    return NextResponse.json({ topIPs })
}

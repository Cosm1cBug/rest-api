import os from 'os'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'
import { getTelemetry } from '@/lib/telemetry.js'

export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    const mem = process.memoryUsage()
    const telemetry = getTelemetry?.() ?? {}

    return Response.json(
        {
            success: true,
            ts: Date.now(),
            process: {
                pid: process.pid,
                uptimeSeconds: Math.round(process.uptime()),
                memory: {
                    rssMb: +(mem.rss / 1024 / 1024).toFixed(1),
                    heapUsedMb: +(mem.heapUsed / 1024 / 1024).toFixed(1),
                    heapTotalMb: +(mem.heapTotal / 1024 / 1024).toFixed(1)
                }
            },
            system: {
                loadAvg: os.loadavg(),
                cpus: os.cpus().length,
                freeMemMb: +(os.freemem() / 1024 / 1024).toFixed(1),
                totalMemMb: +(os.totalmem() / 1024 / 1024).toFixed(1),
                platform: os.platform()
            },
            telemetry
        },
        { headers: { 'Cache-Control': 'no-store' } }
    )
}

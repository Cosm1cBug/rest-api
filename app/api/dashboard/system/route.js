import os from 'os'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

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
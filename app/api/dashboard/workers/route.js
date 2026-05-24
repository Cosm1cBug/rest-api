import { requireAdmin } from '@/lib/auth/requireAdmin.js'

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
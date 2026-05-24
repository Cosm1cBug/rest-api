import { initSocket } from '@/lib/socket.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    if (!global.socketServer) {
      
        global.socketServer = initSocket(global.server)
    }

    return Response.json({
        success: true
    })
}

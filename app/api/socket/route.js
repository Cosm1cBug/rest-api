import { initSocket } from '@/lib/socket.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

/**
 * @openapi
 * /api/socket:
 *   get:
 *     tags: [Dashboard]
 *     summary: Socket.IO init endpoint (initialises the server-side Socket.IO instance)
 *     description: |
 *       Returns 200 to signal the Socket.IO server is reachable. The actual
 *       WebSocket connection is initiated by the client via the Socket.IO
 *       client lib, not by hitting this URL directly.
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Socket.IO ready. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
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

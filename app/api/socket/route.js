Enterimport { initSocket } from '@/lib/socket.js'

export async function GET() {

    if (!global.socketServer) {
      
        global.socketServer = initSocket(global.server)
    }

    return Response.json({
        success: true
    })
}

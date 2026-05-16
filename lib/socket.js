import { Server } from 'socket.io'

let io = null

export function initSocket(server) {
    if (io) return io

    io = new Server(server, {
        cors: {
            origin: '*'
        }
    })

    io.on('connection', socket => {
        console.log('[Socket] Client connected')

        socket.on('disconnect', () => {
            console.log('[Socket] Client disconnected')
        })
        
    })

    return io
}

export function getIO() {
    if (!io) {
        throw new Error('Socket.io not initialized')
    }
    return io
}

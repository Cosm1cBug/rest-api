import { Server } from 'socket.io'

let io = null

export function initSocket(server) {
    if (io) return io

    const raw = process.env.ALLOWED_ORIGIN

    if (!raw || raw.trim() === '' || raw === '*') {
        throw new Error(
            '[socket] ALLOWED_ORIGIN must be set to one or more explicit origins ' +
            '(e.g. https://your-frontend.example.com). Wildcards are not permitted.'
        )
    }

    const origins = raw.split(',').map(o => o.trim()).filter(Boolean)

    io = new Server(server, {
        cors: {
            origin: origins,
            methods: ['GET', 'POST'],
            credentials: false
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

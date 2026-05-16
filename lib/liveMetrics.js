import { getIO } from './socket'

export function emitMetrics(data) {
    const io = getIO()

    if (!io) return

    io.emit('metrics', data)
}
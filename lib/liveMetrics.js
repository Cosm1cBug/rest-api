import { getIO } from './socket.js'

export function emitMetric( event, payload ) {
    try {
        const io = getIO()

        if (!io) return

        io.emit( event, payload )

    } catch (err) {
        console.error('[LiveMetrics Error', err.message) 
    }
}

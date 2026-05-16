import { getIO } from '@/lib/socket.js'

export function emitMetric( event, payload ) {
    try {
        const io = getIO()
        io.emit( event, payload )
    } catch {
       // Ignore if socket not initialized
    }
}

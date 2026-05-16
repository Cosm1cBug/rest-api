import logger from '@/lib/logger.js'
import { v4 as uuid } from 'uuid'

export async function requestLogger(req) {

    const requestId = uuid()
    const start = Date.now()
    req.requestId = requestId

    logger.info({
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        ip: req.headers.get('x-forwarded-for') || 'unknown'
    }, 'Incoming Request')

    return {
        requestId,
        start
    }
}

export function completeRequest({
    requestId,
    start,
    status
}) {

    logger.info({
        requestId,
        status,
        duration: Date.now() - start
    }, 'Request Completed')
}

import { logger } from './logger.js'

export function handleError(err) {
    logger.error({
        message: err.message,
        stack: err.stack
    })

    return Response.json({
        success: false,
        error: 'Internal Server Error'
    }, {
        status: 500
    })
}
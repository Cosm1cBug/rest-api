import logger from '@/lib/logger'

export async function requestLogger(req) {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    logger.info({
        method: req.method,
        url: req.url,
        ip,
        timestamp: new Date().toString()
    })
}
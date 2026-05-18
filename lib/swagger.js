import swaggerJsdoc from'swagger-jsdoc'

export const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'ORBITNODE API',
            version: '1.0.0',
            description: 'Production-grade API platform built with Next.js App Router, Redis, MongoDB, BullMQ, Socket.IO, Prometheus telemetry, realtime observability, and distributed worker architecture.'
        }
    },
    apis: ['./app/api/**/*.js']
})
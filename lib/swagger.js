import swaggerJsdoc from'swagger-jsdoc'

export const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'REST API',
            version: '1.0.0',
            description: 'Production API Platform'
        }
    },
    apis: ['./app/api/**/*.js']
})
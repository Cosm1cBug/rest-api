import client from 'prom-client'

const register = new client.Registry()

client.collectDefaultMetrics({
    register
})

export async function GET(req) {
    const key = req.headers.get('x-admin-key')

    if (key !== process.env.ADMIN_KEY) {
        return new Response('Forbidden', { status: 403 })
    }
    const metrics = await register.metrics()

    return new Response(metrics, {
        headers: {
            'Content-Type': register.contentType
        }
    })
}
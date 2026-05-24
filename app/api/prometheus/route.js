import client from 'prom-client'
import { checkAdminKey } from '@/lib/auth/adminKey.js'

const register = new client.Registry()

client.collectDefaultMetrics({ register })

export async function GET(req) {

    const denied = checkAdminKey(req)
    if (denied) return denied

    const metrics = await register.metrics()

    return new Response(metrics, {
        headers: {
            'Content-Type': register.contentType
        }
    })
}
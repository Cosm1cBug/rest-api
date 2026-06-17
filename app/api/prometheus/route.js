import client from 'prom-client'
import { checkAdminKey } from '@/lib/auth/adminKey.js'

const register = new client.Registry()

client.collectDefaultMetrics({ register })

/**
 * @openapi
 * /api/prometheus:
 *   get:
 *     tags: [Ops]
 *     summary: Prometheus scrape endpoint (admin-key gated)
 *     description: |
 *       Returns Prometheus text-format metrics from `prom-client`. Counters for
 *       request totals, latency histograms, and process metrics. Admin-key
 *       protected — Prometheus servers configure it as a static target with
 *       the header set.
 *     security:
 *       - AdminKey: []
 *     responses:
 *       200:
 *         description: Metrics in Prometheus text exposition format.
 *         content:
 *           text/plain:
 *             schema: { type: string, example: 'api_requests_total 12345' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
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
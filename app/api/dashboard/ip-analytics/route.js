/**
 * Alias for /api/dashboard/ip — exists because the dashboard UI fetches
 * /api/dashboard/ip-analytics. Re-exports the same handler so both URLs
 * stay in sync.
 */
/**
 * @openapi
 * /api/dashboard/ip-analytics:
 *   get:
 *     tags: [Dashboard]
 *     summary: IP analytics (alias for /api/dashboard/ip)
 *     description: Re-exports the same GET handler from /api/dashboard/ip. Exists because the dashboard UI fetches this URL.
 *     security:
 *       - SessionCookie: []
 *     responses:
 *       200: { description: Same as /api/dashboard/ip. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
export { GET } from '@/app/api/dashboard/ip/route.js'

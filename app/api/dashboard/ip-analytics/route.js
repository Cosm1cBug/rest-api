/**
 * Alias for /api/dashboard/ip — exists because the dashboard UI fetches
 * /api/dashboard/ip-analytics. Re-exports the same handler so both URLs
 * stay in sync.
 */
export { GET } from '@/app/api/dashboard/ip/route.js'

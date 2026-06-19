import { runRegistryScraper, unwrapBinaryIfNeeded } from '@/lib/scrapers/registryRunner.js'

export const dynamic = 'force-dynamic'

/**
 * @openapi
 * /api/scrape/{scraper}:
 *   get:
 *     tags: [Scrapers]
 *     summary: Generic scraper endpoint (V16 registry — 15 free public APIs)
 *     description: |
 *       Single dynamic route that fronts the V16 declarative scraper registry.
 *       The `{scraper}` path segment names one of the registered scrapers
 *       (see GET /api/features for the full list with their query params).
 *
 *       Each scraper goes through the full 9-step runScraper pipeline:
 *       verifyApiKey → applyRateLimit → Zod query validation → Redis cache
 *       → in-flight dedup → exponential-backoff retry → SSRF-safe upstream
 *       fetch → cache populate → metric/audit/SIEM log.
 *
 *       Most scrapers return JSON. Two utilities return binary:
 *         - /api/scrape/avatar  — SVG (image/svg+xml)
 *         - /api/scrape/qrcode  — PNG (image/png)
 *
 *       Both binary responses include a 10-minute browser Cache-Control header.
 *
 *     security:
 *       - ApiKey: []
 *     parameters:
 *       - in: path
 *         name: scraper
 *         required: true
 *         schema:
 *           type: string
 *           enum:
 *             - weather
 *             - sunrise-sunset
 *             - country
 *             - geocode
 *             - ip-info
 *             - crypto-price
 *             - fx-rate
 *             - hackernews-top
 *             - hackernews-item
 *             - wikipedia-summary
 *             - npm-package
 *             - spacex-latest
 *             - earthquake-recent
 *             - httpbin-echo
 *             - avatar
 *             - qrcode
 *         description: Registry id of the scraper to invoke. See GET /api/features.
 *     responses:
 *       200:
 *         description: Scraper result. JSON or binary depending on scraper.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Shape depends on the chosen scraper.
 *           image/svg+xml:
 *             schema: { type: string, format: binary }
 *           image/png:
 *             schema: { type: string, format: binary }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403:
 *         description: API key lacks the scope required by this scraper.
 *       404:
 *         description: Unknown scraper id.
 *       429: { $ref: '#/components/responses/RateLimited' }
 *       502:
 *         description: Upstream returned a 5xx or was unreachable.
 *       503:
 *         description: Operator hasn't configured the upstream key for this scraper.
 */
export async function GET(req, ctx) {
    const { scraper } = await ctx.params
    const response = await runRegistryScraper(req, scraper)
    return unwrapBinaryIfNeeded(response)
}

import { runScraper } from '@/lib/scrapers/runScraper.js'
import { githubUserQuerySchema } from '@/lib/validators/github.js'
import { getUser } from '@/lib/scrapers/githubClient.js'

/**
 * GET /api/github/user?username=octocat
 *
 *   x-api-key required.
 *   Cached for 10 minutes (GitHub profile data rarely changes).
 */
/**
 * @openapi
 * /api/github/user:
 *   get:
 *     tags: [Scrapers]
 *     summary: GitHub user profile (10-minute Redis cache, SSRF-hardened upstream)
 *     description: |
 *       Proxies api.github.com/users/{username} through the shared runScraper
 *       pipeline (verifyApiKey → applyRateLimit → Zod → cache → dedup → withRetry
 *       → scrape → setCache → logApiMetric). SSRF mitigation via lib/security/ssrf.js.
 *     security:
 *       - ApiKey: []
 *     parameters:
 *       - in: query
 *         name: username
 *         required: true
 *         schema: { type: string, pattern: '^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$' }
 *         description: Canonical GitHub username.
 *     responses:
 *       200: { description: GitHub user JSON (proxied). }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { description: User not found on GitHub. }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
export async function GET(req) {
    return runScraper(req, {
        name: 'github.user',
        parseInput: (req) => {
            const { searchParams } = new URL(req.url)
            return githubUserQuerySchema.safeParse(
                Object.fromEntries(searchParams.entries())
            )
        },
        cacheKey:  (i) => `gh:user:${i.username.toLowerCase()}`,
        cacheTtl:  60 * 10,        // 10 minutes
        scrape:    (i) => getUser(i.username)
    })
}

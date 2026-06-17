import { runScraper } from '@/lib/scrapers/runScraper.js'
import { githubRepoQuerySchema } from '@/lib/validators/github.js'
import { getRepo } from '@/lib/scrapers/githubClient.js'

/**
 * GET /api/github/repo?owner=octocat&name=hello-world
 *
 *   x-api-key required.
 *   Cached for 5 minutes per (owner, name).
 */
/**
 * @openapi
 * /api/github/repo:
 *   get:
 *     tags: [Scrapers]
 *     summary: Single GitHub repository detail (5-minute cache)
 *     security:
 *       - ApiKey: []
 *     parameters:
 *       - { in: query, name: owner, required: true, schema: { type: string }, description: Repository owner (user or org). }
 *       - { in: query, name: name,  required: true, schema: { type: string }, description: Repository name. }
 *     responses:
 *       200: { description: Repository JSON (proxied). }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { description: Repository not found. }
 */
export async function GET(req) {
    return runScraper(req, {
        name: 'github.repo',
        parseInput: (req) => {
            const { searchParams } = new URL(req.url)
            return githubRepoQuerySchema.safeParse(
                Object.fromEntries(searchParams.entries())
            )
        },
        cacheKey:  (i) => `gh:repo:${i.owner.toLowerCase()}/${i.name.toLowerCase()}`,
        cacheTtl:  60 * 5,         // 5 minutes
        scrape:    (i) => getRepo(i.owner, i.name)
    })
}

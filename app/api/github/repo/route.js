import { runScraper } from '@/lib/scrapers/runScraper.js'
import { githubRepoQuerySchema } from '@/lib/validators/github.js'
import { getRepo } from '@/lib/scrapers/githubClient.js'

/**
 * GET /api/github/repo?owner=octocat&name=hello-world
 *
 *   x-api-key required.
 *   Cached for 5 minutes per (owner, name).
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

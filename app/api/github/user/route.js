import { runScraper } from '@/lib/scrapers/runScraper.js'
import { githubUserQuerySchema } from '@/lib/validators/github.js'
import { getUser } from '@/lib/scrapers/githubClient.js'

/**
 * GET /api/github/user?username=octocat
 *
 *   x-api-key required.
 *   Cached for 10 minutes (GitHub profile data rarely changes).
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

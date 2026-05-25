import { runScraper } from '@/lib/scrapers/runScraper.js'
import { githubReposQuerySchema } from '@/lib/validators/github.js'
import { getUserRepos } from '@/lib/scrapers/githubClient.js'

/**
 * GET /api/github/repos?username=octocat&page=1&perPage=30&sort=updated
 *
 *   x-api-key required.
 *   Cached for 5 minutes per (user, page, perPage, sort) tuple — short
 *   because repo activity shifts quickly (stars, pushedAt).
 */
export async function GET(req) {
    return runScraper(req, {
        name: 'github.repos',
        parseInput: (req) => {
            const { searchParams } = new URL(req.url)
            return githubReposQuerySchema.safeParse(
                Object.fromEntries(searchParams.entries())
            )
        },
        cacheKey:  (i) => `gh:repos:${i.username.toLowerCase()}:p${i.page}:n${i.perPage}:${i.sort}`,
        cacheTtl:  60 * 5,         // 5 minutes
        scrape:    (i) => getUserRepos(i.username, {
            page:    i.page,
            perPage: i.perPage,
            sort:    i.sort
        })
    })
}

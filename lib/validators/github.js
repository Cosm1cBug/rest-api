import { z } from 'zod'

/**
 * GitHub usernames and repo names follow a strict character set.
 * We validate at the boundary so:
 *   - We never proxy garbage to GitHub (saves their rate limit budget)
 *   - We never embed user input in URLs that could break out of the
 *     path segment we intend (even though we URL-encode downstream)
 *
 * GitHub rules:
 *   - Username: 1-39 chars, alphanumerics and single hyphens, may not
 *     start/end with hyphen.
 *   - Repo name: 1-100 chars, alphanumerics + . _ -
 */
const GH_USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
const GH_REPO_RE     = /^[A-Za-z0-9._-]{1,100}$/

export const githubUserQuerySchema = z.object({
    username: z.string().regex(GH_USERNAME_RE, 'Invalid GitHub username')
}).strict()

export const githubReposQuerySchema = z.object({
    username: z.string().regex(GH_USERNAME_RE, 'Invalid GitHub username'),
    page: z.coerce.number().int().min(1).max(100).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(30),
    sort: z.enum(['created', 'updated', 'pushed', 'full_name']).default('updated')
}).strict()

export const githubRepoQuerySchema = z.object({
    owner: z.string().regex(GH_USERNAME_RE, 'Invalid owner'),
    name:  z.string().regex(GH_REPO_RE, 'Invalid repo name')
}).strict()

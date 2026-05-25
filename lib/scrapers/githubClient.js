import { safeFetch } from '@/lib/security/ssrf.js'

/**
 * Thin wrapper around the GitHub REST API.
 *
 * Why a wrapper, not direct fetch calls in each route?
 *   - Single place to attach the Authorization header so a leak of
 *     GITHUB_TOKEN can only happen by reading this file.
 *   - Single place to normalise GitHub's status codes into errors that
 *     runScraper() can map to user-facing HTTP statuses.
 *   - Single place to set the User-Agent header, which GitHub REQUIRES
 *     on every request (omitting it gives a 403 "Request forbidden by
 *     administrative rules").
 *
 * Why route through safeFetch instead of native fetch?
 *   - api.github.com is a public host, but tomorrow some sloppy code
 *     could pass a user-supplied URL here. safeFetch enforces the
 *     scheme/port/range allow-list so SSRF can never sneak in.
 *   - safeFetch already has size + timeout caps and disables redirects
 *     by default — exactly what we want for an API client.
 */

const GITHUB_BASE = 'https://api.github.com'

class GitHubError extends Error {
    constructor(message, status) {
        super(message)
        this.status = status
    }
}

function authHeaders() {
    const token = process.env.GITHUB_TOKEN
    return {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub requires a User-Agent. Identifying as the project name
        // helps GitHub correlate abuse complaints to a real contact.
        'User-Agent': 'OrbitNode-API',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
}

/**
 * Internal: perform one GitHub request and JSON-parse the body.
 *
 * @param {string} path  — e.g. '/users/octocat'
 * @returns {Promise<any>} parsed JSON body
 * @throws {GitHubError}  on non-2xx with .status set
 */
async function ghGet(path) {
    const url = `${GITHUB_BASE}${path}`

    const res = await safeFetch(url, {
        headers: authHeaders(),
        timeoutMs: 8000,
        // GitHub never legitimately redirects API responses. If we ever
        // see a 3xx here it is almost certainly a misconfiguration or
        // SSRF attempt; fail closed.
        followRedirects: false,
        maxBytes: 5 * 1024 * 1024
    })

    if (res.status === 404) {
        throw new GitHubError('Not found', 404)
    }
    if (res.status === 403 || res.status === 429) {
        // 403 from GitHub usually means upstream rate-limited
        // (X-RateLimit-Remaining: 0). Translate to a 429 so the caller's
        // backoff logic kicks in.
        const remaining = res.headers?.['x-ratelimit-remaining']
        const msg = remaining === '0'
            ? 'GitHub rate limit hit'
            : 'GitHub refused the request'
        throw new GitHubError(msg, 429)
    }
    if (res.status < 200 || res.status >= 300) {
        throw new GitHubError(`GitHub upstream error (${res.status})`, 502)
    }

    try {
        return JSON.parse(res.body.toString('utf8'))
    } catch {
        throw new GitHubError('Invalid JSON from upstream', 502)
    }
}

// ---------------------------------------------------- Public client API

/**
 * GET /users/:username
 *
 * Returns the projected fields we care about. Avoid returning the raw
 * GitHub payload — upstream shape changes shouldn't leak into our
 * response contract.
 */
export async function getUser(username) {
    const u = await ghGet(`/users/${encodeURIComponent(username)}`)
    return {
        login:        u.login,
        id:           u.id,
        name:         u.name,
        bio:          u.bio,
        avatarUrl:    u.avatar_url,
        htmlUrl:      u.html_url,
        company:      u.company,
        location:     u.location,
        blog:         u.blog,
        publicRepos:  u.public_repos,
        publicGists:  u.public_gists,
        followers:    u.followers,
        following:    u.following,
        createdAt:    u.created_at,
        updatedAt:    u.updated_at
    }
}

/**
 * GET /users/:username/repos
 *
 * Paginated. Caps perPage at 100 (GitHub's max) so a caller cannot
 * request a giant page.
 */
export async function getUserRepos(username, { page = 1, perPage = 30, sort = 'updated' } = {}) {
    const params = new URLSearchParams({
        per_page: String(Math.min(100, Math.max(1, perPage))),
        page: String(Math.max(1, page)),
        sort,
        type: 'owner'
    })
    const list = await ghGet(`/users/${encodeURIComponent(username)}/repos?${params}`)
    return list.map(r => ({
        id:          r.id,
        name:        r.name,
        fullName:    r.full_name,
        description: r.description,
        htmlUrl:     r.html_url,
        language:    r.language,
        stars:       r.stargazers_count,
        forks:       r.forks_count,
        openIssues:  r.open_issues_count,
        isFork:      r.fork,
        isArchived:  r.archived,
        pushedAt:    r.pushed_at,
        updatedAt:   r.updated_at,
        createdAt:   r.created_at,
        topics:      r.topics || []
    }))
}

/**
 * GET /repos/:owner/:repo
 */
export async function getRepo(owner, name) {
    const r = await ghGet(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
    )
    return {
        id:           r.id,
        name:         r.name,
        fullName:     r.full_name,
        description:  r.description,
        htmlUrl:      r.html_url,
        homepage:     r.homepage,
        language:     r.language,
        license:      r.license?.spdx_id || null,
        stars:        r.stargazers_count,
        forks:        r.forks_count,
        watchers:     r.subscribers_count,
        openIssues:   r.open_issues_count,
        defaultBranch:r.default_branch,
        isFork:       r.fork,
        isArchived:   r.archived,
        isTemplate:   r.is_template,
        topics:       r.topics || [],
        pushedAt:     r.pushed_at,
        updatedAt:    r.updated_at,
        createdAt:    r.created_at,
        owner: {
            login:     r.owner?.login,
            avatarUrl: r.owner?.avatar_url,
            htmlUrl:   r.owner?.html_url
        }
    }
}

import { runScraper } from '@/lib/scrapers/runScraper.js'
import { safeFetch } from '@/lib/security/ssrf.js'
import { getScraper } from '@/lib/scrapers/registry.js'

/**
 * V16 — generic runner that turns a registry entry into a route handler.
 *
 * Called from the single dynamic route at /api/scrape/[scraper]/route.js.
 * Reuses the full existing runScraper pipeline (verifyApiKey → rateLimit
 * → Zod → cache → dedup → withRetry → upstream → cache → metric) so the
 * registered scrapers get every security + observability feature the
 * hand-coded ones have.
 *
 * Binary content handling
 * ───────────────────────
 * runScraper always JSON-wraps the response (it uses lib/apiResponse's
 * success() helper). To pass SVG/PNG bodies through, registered scrapers
 * declaring `responseType: 'svg' | 'png'` return a sentinel object:
 *
 *   { __binary: true, contentType: '...', body: '<base64>' }
 *
 * That sentinel survives the JSON cache layer (just a regular object).
 * The dynamic route at /api/scrape/[scraper] then detects the sentinel
 * in the response body and rewrites the Response object before returning
 * to the client.
 *
 * Cost: base64-encoded SVG/PNG in Redis cache is ~33% bigger than raw
 * bytes. Worth it for the 200-line runScraper stays untouched. The
 * binary endpoints (avatar, qrcode) typically return < 5 KB each so
 * the cache overhead is bounded.
 *
 * Upstream-key precondition
 * ─────────────────────────
 * If a registry entry has `requiresKey`, the env var MUST be set or the
 * scraper returns 503 BEFORE consuming the user's rate-limit budget.
 * None of the V16 tier-1 15 require a key, but the field is wired so
 * future tier-2 additions (NASA, TMDB) just work.
 *
 * Returns a Response object — never throws.
 */
export async function runRegistryScraper(req, scraperId) {
    const entry = getScraper(scraperId)
    if (!entry) {
        return Response.json(
            { success: false, message: `Unknown scraper: ${scraperId}` },
            { status: 404 }
        )
    }

    // Upstream-key precondition — fail fast if operator hasn't configured
    // the required env var. Skips rate-limit + cache pollution.
    if (entry.requiresKey && !process.env[entry.requiresKey]) {
        return Response.json(
            {
                success: false,
                message: `This scraper requires the operator to configure ${entry.requiresKey} (server-side). Contact the deployment admin.`,
                error: 'UPSTREAM_KEY_NOT_CONFIGURED'
            },
            { status: 503 }
        )
    }

    return runScraper(req, {
        name: `scrape.${entry.id}`,
        scope: entry.scope,

        parseInput: () => {
            const url = new URL(req.url)
            const obj = Object.fromEntries(url.searchParams.entries())
            return entry.query.safeParse(obj)
        },

        cacheKey: (input) => {
            // Stable key — sort keys before stringify so equivalent
            // queries collide (?a=1&b=2 == ?b=2&a=1). Safe because Zod
            // has already validated all values to primitives.
            const sorted = Object.keys(input).sort()
                .reduce((acc, k) => { acc[k] = input[k]; return acc }, {})
            return `scrape:${entry.id}:${JSON.stringify(sorted)}`
        },

        cacheTtl: entry.cacheTtl,

        scrape: async (input) => {
            // Build the upstream call from the registry's upstream() fn.
            // Pass both `input` (validated query) and `req` (full request
            // — needed by httpbin-echo which proxies the full query string).
            const { url, headers } = entry.upstream({ input, req })

            const res = await safeFetch(url, {
                method: 'GET',
                headers: headers || {}
            })

            if (!res.ok) {
                const text = await res.text().catch(() => '')
                // Map common upstream statuses to comprehensible app errors.
                const err = new Error(`Upstream returned ${res.status}`)
                err.status = res.status >= 400 && res.status < 500
                    ? res.status   // pass through 404/422
                    : 502          // fold all 5xx into 502 Bad Gateway
                err.upstreamBody = text.slice(0, 500)
                throw err
            }

            // Non-JSON responses (SVG, PNG) get base64-wrapped so the
            // existing JSON-only cache + serialise layer can carry them
            // unchanged. The dynamic route unwraps before responding.
            if (entry.responseType === 'svg' || entry.responseType === 'png') {
                const buf = await res.arrayBuffer()
                return {
                    __binary: true,
                    contentType: res.headers.get('content-type') ||
                        (entry.responseType === 'svg' ? 'image/svg+xml' : 'image/png'),
                    body: Buffer.from(buf).toString('base64')
                }
            }

            return res.json()
        }
    })
}

/**
 * V16 — given a Response from runRegistryScraper, detect if the body
 * is a binary sentinel and convert to a real binary Response.
 *
 * Called from the dynamic route AFTER runRegistryScraper resolves.
 * Why post-process here instead of inside the runner: the runner
 * has to return a Response (that's runScraper's contract). We need
 * to peek inside the body and rewrap. Cleanest as a separate function.
 */
export async function unwrapBinaryIfNeeded(response) {
    if (!response || response.status !== 200) return response

    // Clone so we can read the body without affecting the original.
    const clone = response.clone()
    let payload
    try {
        payload = await clone.json()
    } catch {
        return response   // body wasn't JSON; nothing to do
    }

    // runScraper's success() wraps the data as { success: true, data: ... }.
    // The binary sentinel lives at payload.data.__binary.
    const data = payload?.data
    if (!data || data.__binary !== true) return response

    // Preserve the X-Request-Id from the original response.
    const requestId = response.headers.get('x-request-id')
    const headers = {
        'Content-Type': data.contentType,
        'Cache-Control': 'public, max-age=600'   // 10 min browser cache
    }
    if (requestId) headers['X-Request-Id'] = requestId

    return new Response(Buffer.from(data.body, 'base64'), { status: 200, headers })
}

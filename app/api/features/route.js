import fs from 'fs/promises'
import path from 'path'
import { SCRAPERS, publicSummary } from '@/lib/scrapers/registry.js'

const FEATURES_FILE = path.join(process.cwd(), 'features.json')
const FEATURES_CACHE_MS = 60_000  // 1 minute

let cache = { ts: 0, data: null }

async function loadFeatures() {
    const now = Date.now()
    if (cache.data && now - cache.ts < FEATURES_CACHE_MS) {
        return cache.data
    }

    try {
        const raw = await fs.readFile(FEATURES_FILE, 'utf8')
        const parsed = JSON.parse(raw)
        cache = { ts: now, data: parsed }
        return parsed
    } catch (err) {
        console.error('[features] could not load features.json:', err.message)
        // Return an empty catalogue rather than 500 — the dashboard renders
        // "no features yet" instead of breaking.
        return { folders: [], features: [] }
    }
}

/**
 * @openapi
 * /api/features:
 *   get:
 *     tags: [Public]
 *     summary: Feature catalogue + V16 scraper registry
 *     description: |
 *       Returns three buckets:
 *         - `folders`   — features.json folder grouping (UI navigation)
 *         - `features`  — features.json static list (the original hand-curated catalog)
 *         - `scrapers`  — V16 declarative scraper registry (15+ free public APIs)
 *
 *       For each scraper: id, category, scope required, cache TTL, and a
 *       fragility flag (stable / watch / unofficial) so clients know which
 *       endpoints might break upstream.
 *
 *       Call via:    `GET /api/scrape/<id>?<query params>` with `x-api-key`.
 *     responses:
 *       200:
 *         description: Combined catalogue.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 folders: { type: array }
 *                 features: { type: array }
 *                 scrapers:
 *                   type: array
 *                   description: V16 registry entries (public-safe summary).
 *                 count: { type: integer }
 */
export async function GET() {
    const data = await loadFeatures()

    // V16 — surface the declarative scraper registry alongside the legacy
    // features.json catalog. Group by category so the UI can render
    // collapsible sections. publicSummary() strips the Zod schema +
    // upstream() function (sensitive).
    const scrapers = SCRAPERS.map(publicSummary)

    return Response.json(
        {
            success: true,
            folders: data.folders || [],
            features: data.features || [],
            scrapers,
            count: (data.features || []).length + scrapers.length
        },
        {
            headers: {
                // Public + cacheable for a minute.
                'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
            }
        }
    )
}

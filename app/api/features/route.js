import fs from 'fs/promises'
import path from 'path'

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

export async function GET() {
    const data = await loadFeatures()

    return Response.json(
        {
            success: true,
            folders: data.folders || [],
            features: data.features || [],
            count: (data.features || []).length
        },
        {
            headers: {
                // Public + cacheable for a minute.
                'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
            }
        }
    )
}

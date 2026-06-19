import { z } from 'zod'
import { SCOPES } from '@/lib/auth/apiKeyScopes.js'

/**
 * V16 declarative scraper registry.
 *
 * Each entry describes ONE upstream API as data, not code. The generic
 * registry runner (lib/scrapers/registryRunner.js) reads an entry, runs
 * it through the existing 9-step runScraper() pipeline, and returns the
 * upstream response. Adding a new scraper = adding one object here.
 *
 * Entry shape
 * ───────────
 *   id            string  unique slug, used in /api/scrape/[scraper] URLs
 *   name          string  display name (shown in /api/features)
 *   category      string  human-readable category for the dashboard
 *   description   string  one-line marketing/docs line
 *   scope         string  SCOPES.* — which scope gates this endpoint
 *   query         ZodSchema  validates ?query=string params (strict mode)
 *   upstream      ({input}) => { url, headers? }  builds the fetch target
 *   cacheTtl      number  seconds; how long to cache the response
 *   requiresKey   string|null  env var name if upstream needs a key
 *                              (null = no key needed, fully anonymous upstream)
 *
 * Why a registry, not per-endpoint files
 * ──────────────────────────────────────
 * V0-V15 wired each scraper as its own route.js (e.g. /api/github/user
 * has 80 lines of glue around a 5-line upstream call). At 3 scrapers
 * that was fine; at 15 it would be 1200+ lines of near-identical glue
 * with the same patterns (header injection, scope check, error mapping)
 * duplicated each time.
 *
 * The registry compresses all 15 into ~400 lines of data + one ~200-
 * line runner that exercises the existing runScraper pipeline. Adding
 * scraper #16 is a 15-line addition, not a new file.
 *
 * Trade-off: per-endpoint OpenAPI annotations are now generated from
 * the registry (see tests/scraperRegistry.test.js + lib/swagger.js
 * scraper auto-injection) rather than written by hand. Less control,
 * more uniformity.
 *
 * Adding a new scraper — checklist
 * ────────────────────────────────
 *   1. Pick an id (kebab-case; will appear in URL as
 *      /api/scrape/<id>)
 *   2. Pick a scope from SCOPES.* — create a new one if none fits
 *   3. Write the Zod query schema (.strict()!) — if no query params,
 *      use z.object({}).strict()
 *   4. Write the upstream() function — must return { url, headers? }
 *      Headers should include any required User-Agent (Nominatim,
 *      Wikipedia both require one).
 *   5. Pick cacheTtl — match the upstream's update cadence
 *   6. If the upstream needs a key, set requiresKey to the env var name
 *      (operator must set it for the scraper to work). If unset at
 *      runtime, the scraper returns 503 with a clear error.
 *   7. Add the entry to the SCRAPERS array below
 *   8. Run tests — tests/scraperRegistry.test.js validates the shape
 *      of every entry + checks for id collisions
 *
 * Reliability note
 * ────────────────
 * Free APIs disappear or tighten rate limits without notice. Each entry
 * has a `fragility` field documenting the risk level (stable | watch |
 * unofficial). The /api/features endpoint surfaces this so users can
 * see which integrations might break.
 */

// ──────────────────────────────────────────────────────────────────
// Shared helpers used by multiple entries
// ──────────────────────────────────────────────────────────────────

/**
 * User-Agent string upstreams require/recommend (Nominatim, Wikipedia
 * both enforce). Operators should override via UA_CONTACT env var with
 * their contact email — required by Nominatim's TOS.
 */
const UA = process.env.UA_CONTACT
    ? `OrbitNode/1.0 (${process.env.UA_CONTACT})`
    : 'OrbitNode/1.0 (https://github.com/Cosm1cBug/rest-api)'

/** Latitude / longitude pair — used by multiple weather/geo APIs. */
const LATLNG = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180)
}).strict()

// ──────────────────────────────────────────────────────────────────
// THE REGISTRY
// ──────────────────────────────────────────────────────────────────
export const SCRAPERS = [

    // ─── Weather ───────────────────────────────────────────────────
    {
        id: 'weather',
        name: 'Open-Meteo Weather Forecast',
        category: 'Weather',
        description: '7-day weather forecast for any lat/lng. No key required, generous rate limits.',
        scope: SCOPES.WEATHER,
        query: z.object({
            lat: z.coerce.number().min(-90).max(90),
            lng: z.coerce.number().min(-180).max(180),
            // Subset of Open-Meteo's variables; the user picks what they want
            current: z.string().regex(/^[a-z0-9_,]{1,200}$/i).optional()
                .default('temperature_2m,wind_speed_10m,weather_code')
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://api.open-meteo.com/v1/forecast?latitude=${input.lat}&longitude=${input.lng}&current=${encodeURIComponent(input.current)}`
        }),
        cacheTtl: 10 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    {
        id: 'sunrise-sunset',
        name: 'Sunrise & Sunset Times',
        category: 'Weather',
        description: 'Sunrise, sunset, civil/nautical twilight, and golden hour times for any coordinate.',
        scope: SCOPES.WEATHER,
        query: LATLNG,
        upstream: ({ input }) => ({
            url: `https://api.sunrise-sunset.org/json?lat=${input.lat}&lng=${input.lng}&formatted=0`
        }),
        cacheTtl: 12 * 60 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    // ─── Geography ─────────────────────────────────────────────────
    {
        id: 'country',
        name: 'REST Countries — Country lookup',
        category: 'Geography',
        description: 'Country flags, currencies, languages, borders, region. Search by name.',
        scope: SCOPES.GEOGRAPHY,
        query: z.object({
            name: z.string().min(2).max(56).regex(/^[a-zA-Z\s.-]+$/, 'Country name must be alphabetic')
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://restcountries.com/v3.1/name/${encodeURIComponent(input.name)}`
        }),
        cacheTtl: 24 * 60 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    {
        id: 'geocode',
        name: 'Nominatim (OpenStreetMap) Geocoder',
        category: 'Geography',
        description: 'Forward geocoding — convert a place name to coordinates via OpenStreetMap.',
        scope: SCOPES.GEOGRAPHY,
        query: z.object({
            q: z.string().min(2).max(200)
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input.q)}&format=json&limit=5`,
            // Nominatim REQUIRES a real User-Agent identifying the app
            // (per their TOS). Default UA above identifies OrbitNode and
            // includes the operator's contact email if UA_CONTACT is set.
            headers: { 'User-Agent': UA }
        }),
        cacheTtl: 24 * 60 * 60,
        requiresKey: null,
        // Nominatim enforces 1 req/sec per IP — our rate-limit-per-user
        // is per-IP, so this is fine, but document the constraint.
        fragility: 'watch'
    },

    {
        id: 'ip-info',
        name: 'IP Geolocation (ipapi.co)',
        category: 'Geography',
        description: 'Country, region, city, ASN, timezone for any IPv4/IPv6 address.',
        scope: SCOPES.GEOGRAPHY,
        query: z.object({
            ip: z.string().ip({ version: 'v4' }).or(z.string().ip({ version: 'v6' }))
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://ipapi.co/${input.ip}/json/`
        }),
        cacheTtl: 60 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    // ─── Finance ───────────────────────────────────────────────────
    {
        id: 'crypto-price',
        name: 'CoinGecko Crypto Price',
        category: 'Finance',
        description: 'Real-time price + market data for any of 15,000+ cryptocurrencies.',
        scope: SCOPES.FINANCE,
        query: z.object({
            ids: z.string().regex(/^[a-z0-9-,]{1,300}$/, 'Comma-separated coin IDs (e.g. bitcoin,ethereum)'),
            vs: z.string().regex(/^[a-z]{3,5}$/).optional().default('usd')
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(input.ids)}&vs_currencies=${input.vs}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`
        }),
        cacheTtl: 60,
        requiresKey: null,
        fragility: 'stable'
    },

    {
        id: 'fx-rate',
        name: 'Frankfurter Currency Exchange',
        category: 'Finance',
        description: 'EUR-based currency conversion (works with USD, JPY, INR, etc.). No key required.',
        scope: SCOPES.FINANCE,
        query: z.object({
            from: z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 currency code (e.g. USD)'),
            to: z.string().regex(/^[A-Z,]{3,40}$/, 'Comma-separated ISO 4217 codes'),
            amount: z.coerce.number().positive().max(1e12).optional().default(1)
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://api.frankfurter.app/latest?from=${input.from}&to=${input.to}&amount=${input.amount}`
        }),
        cacheTtl: 60 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    // ─── News ──────────────────────────────────────────────────────
    {
        id: 'hackernews-top',
        name: 'Hacker News — Top Stories',
        category: 'News',
        description: 'Top story IDs from Hacker News. Combine with /api/scrape/hackernews-item to fetch details.',
        scope: SCOPES.NEWS,
        query: z.object({
            limit: z.coerce.number().int().min(1).max(50).optional().default(20)
        }).strict(),
        upstream: ({ input }) => ({
            // Firebase returns the full 500-ID array; the runner trims after.
            url: `https://hacker-news.firebaseio.com/v0/topstories.json?limitToFirst=${input.limit}&orderBy="$key"`
        }),
        cacheTtl: 5 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    {
        id: 'hackernews-item',
        name: 'Hacker News — Story Detail',
        category: 'News',
        description: 'Full story or comment by ID (title, URL, score, by, time).',
        scope: SCOPES.NEWS,
        query: z.object({
            id: z.coerce.number().int().positive().max(99999999)
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://hacker-news.firebaseio.com/v0/item/${input.id}.json`
        }),
        cacheTtl: 5 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    // ─── Reference ─────────────────────────────────────────────────
    {
        id: 'wikipedia-summary',
        name: 'Wikipedia Article Summary',
        category: 'Reference',
        description: 'Article summary, thumbnail, and metadata. English Wikipedia.',
        scope: SCOPES.REFERENCE,
        query: z.object({
            title: z.string().min(1).max(255).regex(/^[^\?#]+$/, 'No ? or # allowed in title')
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(input.title.replace(/\s+/g, '_'))}`,
            // Wikimedia's API requires a User-Agent identifying the application
            // (https://meta.wikimedia.org/wiki/User-Agent_policy). Without it
            // they may rate-limit aggressively or return 403.
            headers: { 'User-Agent': UA }
        }),
        cacheTtl: 60 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    {
        id: 'npm-package',
        name: 'NPM Registry — Package Info',
        category: 'Reference',
        description: 'Package metadata: latest version, dependencies, maintainer, repository.',
        scope: SCOPES.REFERENCE,
        query: z.object({
            // NPM package name regex (incl. scoped packages)
            name: z.string().min(1).max(214)
                .regex(/^(@[a-z0-9-_.~]+\/)?[a-z0-9-_.~]+$/, 'Invalid npm package name')
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://registry.npmjs.org/${encodeURIComponent(input.name).replace('%40', '@').replace('%2F', '/')}`
        }),
        cacheTtl: 60 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    // ─── Science ───────────────────────────────────────────────────
    {
        id: 'spacex-latest',
        name: 'SpaceX — Latest Launch',
        category: 'Science',
        description: 'Most recent SpaceX launch: rocket, payload, success, date, links.',
        scope: SCOPES.SCIENCE,
        query: z.object({}).strict(),
        upstream: () => ({
            url: 'https://api.spacexdata.com/v5/launches/latest'
        }),
        cacheTtl: 60 * 60,
        requiresKey: null,
        fragility: 'watch'   // r/SpaceX-data-api maintained, not by SpaceX
    },

    {
        id: 'earthquake-recent',
        name: 'USGS — Recent Earthquakes',
        category: 'Science',
        description: 'Earthquakes above min magnitude in the last N hours (USGS authoritative feed).',
        scope: SCOPES.SCIENCE,
        query: z.object({
            hours: z.coerce.number().min(1).max(168).optional().default(24),
            minMagnitude: z.coerce.number().min(0).max(10).optional().default(4.5)
        }).strict(),
        upstream: ({ input }) => {
            const end = new Date()
            const start = new Date(end.getTime() - input.hours * 3600 * 1000)
            const fmt = (d) => d.toISOString().slice(0, 19)   // YYYY-MM-DDTHH:MM:SS
            return {
                url: `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${fmt(start)}&endtime=${fmt(end)}&minmagnitude=${input.minMagnitude}`
            }
        },
        cacheTtl: 5 * 60,
        requiresKey: null,
        fragility: 'stable'
    },

    // ─── Utilities ─────────────────────────────────────────────────
    {
        id: 'httpbin-echo',
        name: 'httpbin — HTTP Echo / Inspector',
        category: 'Utilities',
        description: 'Echoes back request headers and query string. Useful for debugging client integrations.',
        scope: SCOPES.UTILITIES,
        query: z.object({}).passthrough(),   // intentionally lax — echo back anything
        upstream: ({ req }) => {
            const url = new URL(req.url)
            const qs = url.searchParams.toString()
            return {
                url: `https://httpbin.org/get${qs ? '?' + qs : ''}`
            }
        },
        cacheTtl: 0,   // echo: never cache
        requiresKey: null,
        fragility: 'stable'
    },

    {
        id: 'avatar',
        name: 'DiceBear Avatar',
        category: 'Utilities',
        description: 'Generate a unique avatar SVG from a seed string. Multiple styles available.',
        scope: SCOPES.UTILITIES,
        query: z.object({
            seed: z.string().min(1).max(128),
            style: z.enum([
                'pixel-art', 'avataaars', 'bottts', 'identicon', 'initials',
                'lorelei', 'micah', 'notionists', 'open-peeps', 'shapes'
            ]).optional().default('identicon')
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://api.dicebear.com/9.x/${input.style}/svg?seed=${encodeURIComponent(input.seed)}`
        }),
        cacheTtl: 24 * 60 * 60,
        requiresKey: null,
        fragility: 'stable',
        // SVG response (not JSON). Runner detects content-type and passes through.
        responseType: 'svg'
    },

    {
        id: 'qrcode',
        name: 'QR Code Generator (qrserver.com)',
        category: 'Utilities',
        description: 'Generate a QR code PNG from arbitrary text/URL.',
        scope: SCOPES.UTILITIES,
        query: z.object({
            data: z.string().min(1).max(2048),
            size: z.coerce.number().int().min(50).max(1000).optional().default(200)
        }).strict(),
        upstream: ({ input }) => ({
            url: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(input.data)}&size=${input.size}x${input.size}`
        }),
        cacheTtl: 24 * 60 * 60,
        requiresKey: null,
        fragility: 'stable',
        responseType: 'png'
    }
]

// ──────────────────────────────────────────────────────────────────
// Lookup helpers
// ──────────────────────────────────────────────────────────────────

const _byId = new Map(SCRAPERS.map(s => [s.id, s]))

/** Returns the registry entry for `id`, or null if unknown. */
export function getScraper(id) {
    if (typeof id !== 'string') return null
    return _byId.get(id) || null
}

/** Returns the list of all registry IDs (used by /api/features etc.). */
export function listScraperIds() {
    return SCRAPERS.map(s => s.id)
}

/**
 * Returns the public-safe summary for /api/features.
 * Excludes the Zod schema (it would JSON-serialise to {}) and the
 * upstream function (sensitive: would leak the URL pattern).
 */
export function publicSummary(s) {
    return {
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        scope: s.scope,
        cacheTtl: s.cacheTtl,
        requiresKey: !!s.requiresKey,
        fragility: s.fragility,
        responseType: s.responseType || 'json'
    }
}

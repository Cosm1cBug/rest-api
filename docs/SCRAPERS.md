# V16 Scraper Registry

OrbitNode's scraper layer has two parallel systems:

1. **Hand-coded scrapers** under `/api/github/*` and `/api/uploads`
   (V0–V15). One route file per endpoint; each calls `runScraper()`
   directly with its own Zod schema and `scrape()` function.

2. **Declarative registry** under `/api/scrape/[scraper]` (V16). Every
   entry is a config object in `lib/scrapers/registry.js`; one dynamic
   route handles all of them via `lib/scrapers/registryRunner.js`.

This doc covers the V16 registry. For the hand-coded pattern see the
existing `/api/github/*` files as the canonical example.

---

## What's in the registry (16 scrapers, 7 categories)

| Category | Scrapers |
|---|---|
| Weather   | `weather`, `sunrise-sunset` |
| Geography | `country`, `geocode`, `ip-info` |
| Finance   | `crypto-price`, `fx-rate` |
| News      | `hackernews-top`, `hackernews-item` |
| Reference | `wikipedia-summary`, `npm-package` |
| Science   | `spacex-latest`, `earthquake-recent` |
| Utilities | `httpbin-echo`, `avatar`, `qrcode` |

Every entry's full schema (params, cache TTL, scope required, fragility
flag) is browsable via `GET /api/features` — that's the public catalogue
the dashboard renders for users picking which endpoints to use.

---

## Calling a scraper

```bash
curl -H "x-api-key: $YOUR_KEY" \
     "https://your-host/api/scrape/weather?lat=51.5&lng=-0.1"
```

Response shape depends on the scraper. Most return JSON proxied from
the upstream; `avatar` returns `image/svg+xml`; `qrcode` returns
`image/png`.

Browser cache for binary responses: 10 minutes (the `Cache-Control`
header is set automatically by `registryRunner.js`).

---

## Scopes

Your API key must include the scope listed in the scraper's registry
entry. Categories map to scopes 1:1:

| Scope          | Gates endpoints |
|----------------|-----------------|
| `weather`      | weather, sunrise-sunset |
| `geography`    | country, geocode, ip-info |
| `finance`      | crypto-price, fx-rate |
| `news`         | hackernews-top, hackernews-item |
| `reference`    | wikipedia-summary, npm-package |
| `science`      | spacex-latest, earthquake-recent |
| `utilities`    | httpbin-echo, avatar, qrcode |

Existing `github` and `uploads:read` scopes are unchanged (back-compat
for keys issued before V16).

Keys issued without any explicit scope have **full access** — that's
the V11 default. Granular scopes are opt-in for users who want to
limit blast radius if a key leaks.

---

## Adding a new scraper

The checklist lives at the top of `lib/scrapers/registry.js`. Summary:

```js
{
    id: 'my-new-thing',                        // kebab-case, appears in URL
    name: 'Display Name',                      // shown in /api/features
    category: 'Weather',                       // groups in the dashboard
    description: 'One-line marketing copy.',
    scope: SCOPES.WEATHER,                     // or add a new SCOPES.* entry
    query: z.object({ foo: z.string() }).strict(),  // MUST be strict
    upstream: ({ input }) => ({
        url: `https://upstream.example.com/api?q=${encodeURIComponent(input.foo)}`,
        headers: { 'User-Agent': UA }          // include UA if upstream requires
    }),
    cacheTtl: 60 * 60,                         // seconds; match upstream update cadence
    requiresKey: null,                         // or 'SOME_ENV_VAR' if the upstream needs an operator key
    fragility: 'stable'                        // stable | watch | unofficial
}
```

Then `npm test` — `tests/scraperRegistry.test.js` validates the shape
and will tell you what's wrong. If you forget the test sample for the
new id, that test fails with a clear message; add the sample and you're
done.

---

## Fragility flags

Free APIs disappear. Each entry's `fragility` field tells users what to
expect:

| Flag | Meaning |
|------|---------|
| `stable`     | Backed by a well-funded org with a documented SLA. Has been reliable for years. (Open-Meteo, USGS, NPM, Wikipedia, HN, CoinGecko, ipapi, Frankfurter, Sunrise-Sunset, DiceBear, qrserver.com, httpbin, RestCountries) |
| `watch`      | Mostly reliable but has rate-limit gotchas or operational constraints worth knowing about. (Nominatim — 1 req/sec; SpaceX-data — community-maintained mirror) |
| `unofficial` | Not blessed by the upstream; could vanish or break with no notice. (None in V16 tier-1, but reserved for things like the unofficial Yahoo Finance endpoint) |

---

## Operating limits the registry enforces

| Layer | Limit | Where |
|-------|-------|-------|
| Per-user per-IP | 100 req/min, 5-min block on breach | `lib/rateLimit.js` |
| Per-user usage quota | Daily quota in `DAILY_QUOTA` | `lib/usage.js` |
| Upstream content size | Capped by `safeFetch` | `lib/security/ssrf.js` |
| Upstream timeout | Capped by `safeFetch` | `lib/security/ssrf.js` |
| SSRF | DNS rebinding protection, IP range allowlist | `lib/security/ssrf.js` |
| Cache | Per-entry TTL (registry config) | `lib/cache.js` (Redis) |
| In-flight dedup | Identical requests coalesce | `lib/inflight.js` |

All of the above apply uniformly to every registry entry without any
per-entry configuration — the runner picks them up from `runScraper()`.

---

## Operator concerns

### Upstream-key env vars

None of the V16 tier-1 16 require an upstream key. If you add tier-2
endpoints (NASA, TMDB, Alpha Vantage), the registry's `requiresKey`
field lists the env var name. Operators set it; users see 503 with a
clear error if it's not set.

The check runs **before** rate-limit / cache, so users don't waste
quota on misconfigured upstreams.

### Recommended User-Agent

Set `UA_CONTACT` in your `.env`:

```env
UA_CONTACT=ops@your-domain.com
```

The registry's User-Agent string becomes
`OrbitNode/1.0 (ops@your-domain.com)`. Required by Nominatim's TOS and
recommended by Wikimedia's API guidelines.

If you don't set it, the default is generic and risks rate-limit
throttling on the few APIs that enforce per-UA policies.

### Cache pressure

At 100 req/min × 16 scrapers × 1000 active users, worst-case Redis
holds ~16,000 cached entries simultaneously. Each entry is ~5-50 KB.
Memory ceiling: ~800 MB at the upper bound, typically much lower
(most TTLs are 1+ hour so churn is low).

Watch `redis-cli INFO memory` after rollout. If it grows past 1 GB,
either lower TTLs on the highest-cardinality endpoints (avatar by seed,
qrcode by data) or move to a dedicated Redis instance.

### SIEM volume

Every scraper request fires one `apilog` event via the V11 SIEM sink.
At significant traffic that's substantial disk write volume. See
`docs/SIEM.md` Option A for the `<ignore_lines>` filter pattern to
drop high-cardinality, low-value `apilog` events at the agent.

---

## Why declarative + registry vs per-endpoint files

15+ hand-coded scrapers would be 1500+ lines of near-identical glue
code. Adding a feature (e.g. the V15 `X-RateLimit-*` headers) means
touching every file. Forgetting one is a silent bug.

The registry compresses this to ~400 lines of data + 200 lines of
generic runner. Adding scraper #17 is a 15-line registry entry, not
a new route file. Adding a cross-cutting feature is one edit in the
runner that applies to all entries uniformly.

Trade-off: per-endpoint OpenAPI annotations are now generated from
the registry rather than hand-written, so the docs in `/api/docs` are
slightly more uniform (less per-endpoint colour) but always in sync
with the schema. If a future endpoint needs truly custom behaviour
(e.g. a POST scraper, or a streaming response), drop back to the
hand-coded pattern under its own `/api/<thing>/route.js`.

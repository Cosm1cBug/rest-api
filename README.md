# OrbitNode API

A self-hosted, production-grade API platform built on Next.js App Router. Developers sign up, receive an API key, and hit endpoints with rate limiting, Redis caching, real-time observability, and a full admin dashboard included out of the box.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database | MongoDB + Mongoose |
| Cache / Queue | Redis + BullMQ |
| Auth | Next-Auth (JWT) + bcrypt API keys |
| Real-time | Socket.IO |
| Metrics | Prometheus + prom-client |
| Logging | Pino |
| Validation | Zod |
| Frontend | React 19, TailwindCSS, Recharts |
| Runtime | Node.js 20 |

---

## Features

### API Platform
- **Split-key API authentication** — keys take the form `keyId.secret`; only the bcrypt hash of `secret` is stored, so a database leak does not expose live keys
- **Per-IP Redis rate limiting** with automatic block on breach
- **Redis response caching** with configurable TTL
- **Inflight request deduplication** — 50 concurrent requests for the same key run only one scrape
- **Global concurrency queue** (p-queue) — caps parallel scraper executions
- **Automatic retry** with exponential backoff (p-retry)
- **SSRF-hardened outbound fetch** — `ipaddr.js` range classification, DNS-rebinding mitigation, response size + timeout caps
- **Request ID** propagated through logs and metrics
- **Graceful shutdown** (SIGINT / SIGTERM)

### Observability Dashboard (admin only)
- Live request feed via WebSocket
- Hourly traffic charts
- Latency heatmap per endpoint
- Cache hit / miss ratio
- Top endpoints by volume
- Top users by request count
- IP analytics + geo breakdown (country / region / city)
- System metrics (CPU load, memory, uptime)
- BullMQ queue state (active, waiting, completed, failed, delayed)
- Worker process health + heartbeat
- Prometheus metrics endpoint

### Security
- **CSP, HSTS (preload), COOP, CORP, X-Frame-Options, Permissions-Policy, Referrer-Policy** set on every response via `middleware.js`
- **Edge admin gate** in middleware blocks `/admin`, `/dashboard`, `/api/dashboard/*` for non-admin sessions before any handler runs
- **Per-route `requireAdmin`** as defense-in-depth even if middleware is ever misconfigured
- **`requireJson`** rejects non-JSON POSTs (lightweight CSRF mitigation on top of SameSite cookies)
- **Constant-time admin key compare** via `crypto.timingSafeEqual`; fail-closed when env var unset
- **Boot-time secret validation** (`lib/auth/env.js`) refuses to start with weak/missing secrets in production
- **Zod-validated, NoSQL-injection-safe** credential & registration handlers
- **OTP brute-force defence**: per-OTP attempt counter + per-IP and per-(IP, email) Redis sliding-window limiters
- **Username/email enumeration resistance**: `/auth/send-otp` returns the same response regardless of whether the address is registered; `/auth/verify-otp` collapses duplicate-username / duplicate-email errors into one generic message
- **Filename allow-list** on `/api/uploads` (alphanumerics + `_-.` only) eliminates path traversal and `Content-Disposition` header injection
- **Anti-spoof client-IP extraction** (`lib/clientIp.js`) honors `X-Forwarded-For` only when `TRUSTED_PROXIES` is set
- **Non-root Docker user**, multi-stage build, healthcheck
- **Compose-private datastores**: Mongo and Redis have no published ports and require credentials

---

## Request Lifecycle

```
Incoming Request
        │
        ▼
 middleware.js
 ├── Security headers (CSP, HSTS, COOP, CORP, X-Frame-Options, …)
 └── If path is admin-scoped, verify JWT + role=admin before letting through
        │
        ▼
 API Route Handler
        │
        ├── 1. requireJson           — reject non-JSON POSTs
        ├── 2. requestLogger         — assign request ID, log entry
        ├── 3. applyRateLimit        — Redis sliding window per IP
        ├── 4. verifyApiKey          — split-key format check + bcrypt
        ├── 5. Zod schema parse      — validate body, reject NoSQL operators
        ├── 6. validateUrl / safeFetch — SSRF block, DNS rebinding mitigation
        ├── 7. getCache              — return early on Redis hit
        ├── 8. dedup                 — coalesce identical in-flight requests
        ├── 9. globalQueue           — enforce concurrency cap
        ├── 10. withRetry            — up to 3 attempts, exponential backoff
        ├── 11. Scraper              — fetch + parse external data
        ├── 12. setCache             — store result in Redis with TTL
        └── 13. logApiMetric         — write to MongoDB + Prometheus + Socket.IO
                    │
                    ▼
             BullMQ (heavy async jobs)
                    │
                    ▼
             scraper.worker.js (separate process)
```

---

## Project Structure

```
/app
├── api/
│   ├── auth/[...nextauth]/     — Next-Auth handler (re-exports authOptions)
│   ├── dashboard/              — ALL routes require admin session
│   │   ├── advanced/           — hourly hits, geo, IP, cache analytics
│   │   ├── charts/             — traffic chart data
│   │   ├── ip/                 — top IPs
│   │   ├── queue/              — BullMQ state
│   │   ├── system/             — CPU, memory, uptime
│   │   ├── telemetry/          — in-process telemetry snapshot
│   │   └── workers/            — worker process info
│   ├── docs/                   — Swagger/OpenAPI docs (admin-key protected)
│   ├── health/                 — public MongoDB + Redis health check
│   ├── prometheus/             — Prometheus scrape (admin-key protected)
│   ├── socket/                 — Socket.IO init (admin session required)
│   ├── uploads/                — serve files from tmp/ (API key required)
│   └── youtube/                — example scraper route
├── admin/                      — admin UI (server component, double-gated)
├── auth/login/                 — login page
├── auth/register/              — registration (3 steps: form → OTP → key)
├── dashboard/                  — main dashboard UI (admin session required)
├── features/[slug]/            — feature detail pages
└── user/profile/               — user profile page

/lib
├── auth/
│   ├── adminKey.js             — timing-safe ADMIN_KEY check
│   ├── authOptions.js          — Next-Auth config (centralised)
│   ├── env.js                  — boot-time secret validation
│   ├── otpRateLimit.js         — Redis limiters for /verify-otp
│   ├── requireAdmin.js         — per-route admin guard
│   ├── requireJson.js          — content-type guard / CSRF mitigation
│   └── timing.js               — jitter to mask response timing
├── middleware/
│   ├── adminRateLimit.js       — dashboard rate limiter
│   ├── apiKey.js               — verifyApiKey (split-key + bcrypt)
│   └── requestLogger.js        — request ID + entry/exit logging
├── security/
│   └── ssrf.js                 — validateUrl + safeFetch
├── validators/
│   └── auth.js                 — Zod schemas (login, register)
├── abuseDetection.js           — Redis sliding-window abuse counter
├── apiResponse.js
├── bullmq.js
├── cache.js
├── clientIp.js                 — anti-spoof IP extraction
├── downloadFile.js             — uses safeFetch, validateUpload
├── errorHandler.js
├── inflight.js
├── ipAnalytics.js
├── liveMetrics.js
├── logger.js                   — pino (pretty in dev, JSON in prod)
├── metricsLogger.js
├── mongodb.js
├── prometheus.js
├── queue.js
├── queueTelemetry.js
├── rateLimit.js
├── redis.js
├── retry.js
├── shutdown.js
├── socket.js                   — fail-closed CORS (no wildcard)
├── swagger.js
├── telemetry.js
├── uploadValidation.js         — magic-byte (file-type) check
└── validation.js

/models
├── apiLog.js                   — per-request log (TTL: 90 days)
├── otp.js                      — OTP codes (TTL: 5 minutes) + attempt counter
├── pageView.js                 — page view counters
└── user.js                     — users + API key hashes + role

/workers
└── scraper.worker.js           — BullMQ worker process (runs separately)

/components
├── LiveMetrics.jsx
├── alert.jsx
├── navbar.jsx
└── providers.jsx

/contexts
└── userContext.jsx
```

---

## Installation

### 1. Clone

```bash
git clone https://github.com/Cosm1cBug/rest-api.git
cd rest-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in the values — see the [Environment Variables](#environment-variables) section below. The server refuses to start in production if any of `NEXTAUTH_SECRET`, `JWT_SECRET`, `ADMIN_KEY`, `FAKE_BCRYPT_HASH`, or `ALLOWED_ORIGIN` are missing or shorter than 32 characters.

### 4. Run in development

Open two terminals:

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — BullMQ worker process (required for queue-based jobs)
npm run worker
```

---

## Production Deployment

### Option A — PM2

```bash
npm run build
npx pm2 start ecosystem.config.js
```

PM2 starts two processes automatically: `orbitnode-api` (Next.js) and `scraper-worker` (BullMQ worker).

```bash
npx pm2 logs          # view logs
npx pm2 monit         # process monitor
npx pm2 stop all      # stop
```

### Option B — Docker Compose

```bash
docker-compose up --build
```

Services started: `api` (port 3000), `worker`, `redis`, `mongodb`. **`redis` and `mongodb` are intentionally not published to the host**; they are reachable only from the compose network. If you need host access, add `ports: ['127.0.0.1:6379:6379']` (or similar) explicitly — never bind to `0.0.0.0`.

---

## Environment Variables

```env
# ── App
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://yourdomain.com      # Socket.IO CORS origin; comma-separated for multiple
TRUSTED_PROXIES=10.0.0.5,10.0.0.6          # IPs of your LB/proxy; required for accurate rate-limit keys

# ── Auth
NEXTAUTH_SECRET=                           # required, ≥32 chars (openssl rand -hex 32)
NEXTAUTH_URL=https://yourdomain.com        # required — must be your real domain in prod
JWT_SECRET=                                # required, ≥32 chars
FAKE_BCRYPT_HASH=                          # required in prod — prevents username enumeration
                                           # node -e "import('bcryptjs').then(b => b.default.hash('dummy',12).then(console.log))"

# ── Database
MONGODB_URI=                               # required
MONGO_USER=                                # required if using the docker-compose mongo service
MONGO_PASS=                                # required if using the docker-compose mongo service

# ── Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=                            # required in prod

# ── Admin
ADMIN_KEY=                                 # protects /api/prometheus and /api/docs (≥32 chars)
                                           # openssl rand -hex 32

# ── Spotify scraper (optional)
SPOTIFY_ID=
SPOTIFY_SECRET=

# ── Email (OTP, optional unless registration is enabled)
EMAIL_USER=
EMAIL_PASS=

# ── Instagram scraper (optional)
INSTAGRAM_HASH_SECRET=                     # generate fresh; do NOT reuse any value seen in this repo's history
```

---

## API Usage

All scraper / data routes require an `x-api-key` header. Keys are issued **once** on registration and take the format `keyId.secret`. The plaintext key is never persisted server-side — if a user loses theirs they must rotate.

```bash
curl -X POST https://yourdomain.com/api/youtube \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY_ID.YOUR_SECRET" \
  -d '{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }'
```

**Rate limit:** 100 requests per 60 seconds per IP. Exceeding this returns `429` with a 5-minute block.

---

## Internal Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | None | MongoDB + Redis status (no internals). Safe for load balancers. |
| `GET /api/prometheus` | `x-admin-key` | Prometheus metrics scrape. Constant-time check; fails closed when `ADMIN_KEY` unset. |
| `GET /api/docs` | `x-admin-key` | Swagger / OpenAPI spec. |
| `GET /api/dashboard/*` | **Admin session** | Every dashboard route is gated at the edge in `middleware.js` and re-checked per route via `requireAdmin`. |
| `GET /api/socket` | **Admin session** | Initialises the Socket.IO server. |
| `GET /api/uploads` | `x-api-key` | Serves files from `tmp/`. Filename must match `^[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,8}$`. |

---

## Authentication Flows

### Registration

1. `POST /api/auth/send-otp { email }` — returns a generic 200 in all cases. If the address is already registered the response is identical to the "new user" case, with no email actually sent (anti-enumeration).
2. `POST /api/auth/verify-otp { username, email, password, otp }` — on success returns `{ apiKey, apiKeyId }` **once**. The user must save the key; the server only retains its bcrypt hash.

Brute-force defences on `/verify-otp`:
- Per-OTP attempt cap (5).
- Per-(IP, email) limit: 10 attempts / 10 min.
- Per-IP global limit: 50 attempts / 10 min.

### Login

`signIn('credentials', { email, password })` via NextAuth. Even when the email does not exist, bcrypt runs against `FAKE_BCRYPT_HASH` to keep response timing constant. Inputs are Zod-validated to reject NoSQL operator payloads before hitting MongoDB.

### Admin Access

A user becomes an admin by having `role: 'admin'` on their User document. Both the edge middleware and each protected route verify `token.role === 'admin'`.

---

## Adding New Scrapers

See [`ADD_NEW_APIS_&_ENDPOINTS.md`](./ADD_NEW_APIS_&_ENDPOINTS.md) for the step-by-step guide to adding a new scraper endpoint with caching, rate limiting, validation, and metrics wired in automatically.

---

## Security Reporting

If you find a vulnerability, please **do not** open a public GitHub issue. Email the maintainer (see commit history) with details and a reproduction. Coordinated disclosure is appreciated.

---

## License

Copyright (c) 2026 COSMICBUG

All rights reserved. This source code and associated files may not be copied, modified, distributed, sublicensed, commercialized, or used in any form without explicit written permission from the author. Unauthorized use is strictly prohibited.

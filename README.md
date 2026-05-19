# OrbitNode API
 
A self-hosted, production-grade API platform built on Next.js App Router. Developers sign up, receive an API key, and hit scraper/utility endpoints with rate limiting, Redis caching, real-time observability, and a full admin dashboard included out of the box.
 
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
- API key authentication (split-key with bcrypt hashing — DB leaks don't expose live keys)
- Per-IP Redis rate limiting with automatic block on breach
- Redis response caching with configurable TTL
- Inflight request deduplication — 50 concurrent requests for the same key run only one scrape
- Global concurrency queue (p-queue) — caps parallel scraper executions
- Automatic retry with exponential backoff (p-retry)
- SSRF protection — DNS resolution + private IP range blocking on all outbound fetches
- Request ID tracking on every request
- Graceful shutdown (SIGINT / SIGTERM)

### Observability Dashboard
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
---
 
## Request Lifecycle
 
```
Incoming Request
        │
        ▼
 middleware.js
 (Security headers: CSP, HSTS, X-Frame-Options, etc.)
        │
        ▼
 API Route Handler
        │
        ├── 1. requestLogger       — assign request ID, log entry
        ├── 2. applyRateLimit      — Redis sliding window per IP
        ├── 3. verifyApiKey        — bcrypt compare against DB hash
        ├── 4. Zod schema parse    — validate + type-check body
        ├── 5. validateUrl (SSRF)  — DNS lookup, block private IPs
        ├── 6. getCache            — return early on Redis hit
        │
        ├── 7. dedup               — coalesce identical in-flight requests
        ├── 8. globalQueue         — enforce concurrency cap
        ├── 9. withRetry           — up to 3 attempts, exponential backoff
        ├── 10. Scraper            — fetch + parse external data
        │
        ├── 11. setCache           — store result in Redis with TTL
        └── 12. logApiMetric       — write to MongoDB + Prometheus + Socket.IO
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
│   ├── auth/[...nextauth]/     — Next-Auth handler
│   ├── dashboard/
│   │   ├── advanced/           — hourly hits, geo, IP, cache analytics
│   │   ├── charts/             — traffic chart data
│   │   ├── ip/                 — top IPs
│   │   ├── queue/              — BullMQ state
│   │   ├── system/             — CPU, memory, uptime
│   │   ├── telemetry/          — in-process telemetry snapshot
│   │   └── workers/            — worker process info
│   ├── docs/                   — Swagger/OpenAPI docs (admin protected)
│   ├── health/                 — MongoDB + Redis health check
│   ├── prometheus/             — Prometheus scrape endpoint (admin protected)
│   ├── socket/                 — Socket.IO initialisation route
│   ├── uploads/                — serve files from tmp/
│   ├── views/                  — page view counter
│   └── youtube/                — example scraper route
├── admin/                      — admin UI page
├── auth/login/                 — login page
├── auth/register/              — registration page
├── dashboard/                  — main dashboard UI
├── features/[slug]/            — feature detail pages
└── user/profile/               — user profile page
 
/lib
├── middleware/
│   ├── adminRateLimit.js       — dashboard rate limiter
│   ├── apiKey.js               — API key split + bcrypt verify
│   └── requestLogger.js        — request ID + entry/exit logging
|
├── scrapers/                   - add scrapers here

├── security/
│   └── ssrf.js                 — SSRF / private IP protection
├── validators/
│   └── youtube.js              — Zod schemas
├── abuseDetection.js
├── apiResponse.js
├── bullmq.js
├── cache.js
├── downloadFile.js
├── errorHandler.js
├── inflight.js
├── initFeature.js
├── ipAnalytics.js
├── liveMetrics.js
├── logger.js
├── metrics.js
├── metricsLogger.js
├── mongodb.js
├── prometheus.js
├── queue.js
├── queueTelemetry.js
├── rateLimit.js
├── redis.js
├── retry.js
├── runMiddleware.js
├── shutdown.js
├── socket.js
├── swagger.js
├── telemetry.js
├── uploadValidation.js
└── validation.js
 
/models
├── apiLog.js                   — per-request log (TTL: 90 days)
├── otp.js                      — OTP codes (TTL: 5 minutes)
├── pageView.js                 — page view counters
└── user.js                     — users + API key hashes
 
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
 
Fill in the values — see the [Environment Variables](#environment-variables) section below.
 
### 4. Run in development
 
Open two terminals:
 
```bash
# Terminal 1 — Next.js dev server
npm run dev
 
# Terminal 2 — BullMQ worker process (required for queue-based jobs)
npm run worker
```
 
The dashboard runs on a separate port:
 
```bash
npm run dashboard    # starts on http://localhost:3001
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
 
Services started: `api` (port 3000), `worker`, `redis` (port 6379), `mongodb` (port 27017).
 
---
 
## Environment Variables
 
```env
# ── App
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://yourdomain.com      # Socket.IO CORS origin
 
# ── Auth
NEXTAUTH_SECRET=                           # required — Next-Auth crashes without this
NEXTAUTH_URL=https://yourdomain.com        # required — must be your real domain in prod
JWT_SECRET=                                # required — signs JWT tokens
FAKE_BCRYPT_HASH=                          # required in prod — prevents username enumeration
                                           # generate: node -e "import('bcryptjs').then(b => b.default.hash('dummy',12).then(console.log))"
 
# ── Database
MONGODB_URI=                               # required
 
# ── Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=                            # required in prod
 
# ── Admin
ADMIN_KEY=                                 # protects /api/prometheus and /api/docs
                                           # generate: openssl rand -hex 32
 
# ── Spotify scraper
SPOTIFY_ID=
SPOTIFY_SECRET=
 
# ── Email (OTP)
EMAIL_USER=
EMAIL_PASS=
 
# ── Instagram scraper
INSTAGRAM_HASH_SECRET=                     # move hardcoded value here, rotate before deploy
```
 
---
 
## API Usage
 
All API routes require an `x-api-key` header. Keys are issued on registration and take the format `keyId.secret`.
 
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
| `GET /api/health` | None | MongoDB + Redis status, uptime, memory |
| `GET /api/prometheus` | `x-admin-key` | Prometheus metrics scrape |
| `GET /api/docs` | `x-admin-key` | Swagger / OpenAPI spec |
| `GET /api/dashboard/telemetry` | None | In-process telemetry snapshot |
| `GET /api/dashboard/queue` | None | BullMQ job counts |
| `GET /api/dashboard/charts` | None | Hourly traffic data |
| `GET /api/dashboard/ip` | None | Top IPs by request volume |
| `GET /api/dashboard/system` | None | CPU, memory, platform info |
| `GET /api/dashboard/workers` | None | Worker process stats |
| `GET /api/dashboard/advanced` | Rate limited | Geo, latency heatmap, active users |
| `GET /api/socket` | None | Initialise Socket.IO connection |
 
---
 
## Health Check
 
```bash
curl https://yourdomain.com/api/health
```
 
```json
{
  "status": "ok",
  "mongodb": "connected",
  "redis": "connected",
  "uptime": 3600,
  "memory": { "rss": 120000000 },
  "timestamp": 1716000000000
}
```
 
---
 
## Adding New Scrapers
 
See [`ADD_NEW_APIS_&_ENDPOINTS.md`](./ADD_NEW_APIS_&_ENDPOINTS.md) for the step-by-step guide to adding a new scraper endpoint with caching, rate limiting, validation, and metrics wired in automatically.
 
---
 
## License
 
Copyright (c) 2026 COSMICBUG
 
All rights reserved. This source code and associated files may not be copied, modified, distributed, sublicensed, commercialized, or used in any form without explicit written permission from the author. Unauthorized use is strictly prohibited.
 
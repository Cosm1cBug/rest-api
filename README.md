# OrbitNode API

A self-hosted, production-grade API platform built on Next.js 15. Developers sign up via email + OTP, receive an API key, and hit utility endpoints with rate limiting, Redis caching, brute-force-resistant auth, real-time observability, an admin dashboard, and an audit log included out of the box.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database | MongoDB + Mongoose |
| Cache / Queue | Redis + BullMQ |
| Auth | NextAuth (JWT) + bcrypt API keys |
| Real-time | Socket.IO |
| Metrics | Prometheus + `prom-client` |
| Logging | Pino |
| Validation | Zod (strict mode everywhere) |
| Testing | Vitest |
| CI | GitHub Actions (audit + lint + tests) |
| Runtime | Node.js 20 |

---

## What's included

### API platform
- **Split-key API authentication** — keys take the form `keyId.secret`; only the bcrypt hash of `secret` is stored, so a DB leak does not expose live keys.
- **Multi-key per user** — name keys ("production", "ci-runner"), see `lastUsedAt`, revoke individually.
- **Per-IP Redis rate limiting** with automatic block on breach.
- **Redis response caching** with configurable TTL per endpoint.
- **Inflight request deduplication** — 50 concurrent requests for the same key issue exactly one upstream call.
- **Automatic retry** with exponential backoff (`p-retry`).
- **SSRF-hardened outbound fetch** — `ipaddr.js` range classification, DNS-rebinding mitigation (fetch-by-resolved-IP), response size + timeout caps, no redirects by default.
- **Magic-byte upload validation** (`file-type`) on every persisted file.
- **Request ID** propagated through logs and metrics.
- **Graceful shutdown** (SIGINT / SIGTERM).

### Authentication & account management
- **Registration with email OTP** — 6-digit code, 5-minute TTL, **5-attempt cap per OTP**, dual Redis rate limiters (per-IP + per-(IP, email)).
- **Login brute-force defence** — **per-IP** (20/10 min) + **per-(IP, email)** (10/10 min) Redis sliding-window limiters, plus **per-account lockout** (5 fails → 15-min lock). All three reset on successful login.
- **Constant-time login** — bcrypt always runs against a dummy hash generated at boot (`lib/auth/fakeHash.js`) when the email is unknown, so response timing doesn't reveal whether an email exists or whether an account is locked. No env var to forget.
- **Anti-enumeration OTP flow** — `/api/auth/send-otp` returns the same response whether the email is registered or not; timing is jittered.
- **Password reset** — token hashed (SHA-256) before storage, 1-hour TTL, atomic single-use claim, clears any active lockout on success.
- **Self-service API key management** — create / list / revoke from a UI page.
- **OAuth 2.0 / OIDC sign-in** (V11) — opt-in Google + GitHub providers via `GOOGLE_CLIENT_ID`/`GITHUB_CLIENT_ID` env pairs. Account-linking by verified email (only links when both the existing user's email is verified *and* the OAuth provider asserts `email_verified=true`). New OAuth users get a default API key on first sign-in. Every OAuth decision (signin/link/create/reject) is written to the audit log and forwarded to SIEM via the V11 sink. The login page auto-renders only the buttons for providers actually configured on the deployment.

### Admin
- **User management API** — list/search/paginate, change role, disable/enable (auto-clears lockout), revoke any user's API key.
- **Admin UI** — `/admin/users` (search + bulk actions) and `/admin/audit-log` (paginated viewer).
- **Audit log** — every sensitive admin action recorded with actor, target, before/after diff, IP, and user-agent. Append-only; sensitive fields auto-redacted. Optional [SIEM forwarding](./docs/SIEM.md) ships the same events to Wazuh / ELK / Splunk as NDJSON when `SIEM_AUDIT_PATH` is set.
- **Self-modification guards** — admins cannot change their own role or disable themselves through the API.

### Observability dashboard (admin-only)
- Live request feed via WebSocket.
- Hourly traffic charts and per-endpoint latency heatmap.
- Cache hit/miss ratio, active users (24h), top IPs by volume.
- Geo breakdown (country/region/city) via `geoip-lite`.
- System metrics (CPU, memory, uptime), BullMQ queue state, worker health.
- Prometheus scrape endpoint.

### SIEM forwarding (opt-in)
- **Structured NDJSON event stream** to a file on disk, gated on the `SIEM_AUDIT_PATH` env var. Disabled by default — set the env var to enable; no code change required.
- **Three event types** with a `_type` discriminator: `audit` (admin actions), `apilog` (every API request, ECS-mapped), `security` (abuse detector hits with MITRE ATT&CK IDs).
- **Wazuh-native** — agent reads via `<localfile><log_format>json</log_format></localfile>`, no custom decoder needed. Portable to ELK / Splunk / Datadog via filebeat / fluentd / vector.
- **Fail-closed at boot** — refuses to start if `SIEM_AUDIT_PATH` is set but unwritable. **Fail-open at runtime** — disk full / SIEM down never blocks an admin action; Mongo write remains the source of truth.
- **Concurrency-safe** via POSIX `O_APPEND` atomicity; multi-worker PM2 + BullMQ can share the same file without locks.
- See [`docs/SIEM.md`](./docs/SIEM.md) for design, sample events, suggested Wazuh rules, and volume tuning.
- See [`docs/BACKUP.md`](./docs/BACKUP.md) for backup/restore procedures, RTO/RPO guidance, and disaster-recovery drills (V15).
- See [`docs/DEPLOY-SIEM.md`](./docs/DEPLOY-SIEM.md) for the 10-step operator deployment runbook with verification commands.

### Security
- **Strict CSP, HSTS (preload), COOP, CORP, X-Frame-Options, Permissions-Policy, Referrer-Policy** set on every response via `middleware.js`.
- **Edge admin gate** — `/admin`, `/dashboard`, `/api/dashboard/*`, `/api/admin/*` all blocked for non-admin tokens before any handler runs.
- **Per-route `requireAdmin`** as defense-in-depth even if middleware is ever misconfigured.
- **`requireJson`** rejects non-JSON POSTs (lightweight CSRF mitigation on top of SameSite cookies).
- **`requireSession`** for user-facing routes.
- **Constant-time admin-key compare** via `crypto.timingSafeEqual`; **fails closed** when `ADMIN_KEY` is unset.
- **Boot-time secret validation** (`lib/auth/env.js`) refuses to start in production with weak/missing secrets.
- **Anti-spoof client-IP extraction** (`lib/clientIp.js`) honors `X-Forwarded-For` only when `TRUSTED_PROXIES` is set.
- **Zod-validated, NoSQL-injection-safe** auth handlers (`.strict()` schemas reject unknown fields → user cannot self-promote via `{ role: "admin" }`).
- **Filename allow-list** on `/api/uploads` (`^[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,8}$`) eliminates path traversal and `Content-Disposition` header injection.
- **Non-root Docker** user, multi-stage build, healthcheck.
- **Private datastores** in `docker-compose.yml` — Mongo and Redis have no published ports.
- **`SECURITY.md`** + **`/.well-known/security.txt`** for coordinated disclosure.

### Testing & CI
- **Vitest suite** covering validators, helpers, audit-log sanitisation, SSRF, and a "every `@/` import resolves" guard that catches the kind of refactor breakage that ships features in a broken state.
- **GitHub Actions** runs `npm audit --omit=dev --audit-level=high`, `npm run lint`, and `npm test` on every push/PR.
- **Dependabot** weekly PRs grouped by minor/patch, monthly for actions.

---

## Request lifecycle (scraper endpoints)

Every scraper plugs into the shared `runScraper(req, opts)` wrapper, so the pipeline below applies uniformly.

```
Incoming request
        │
        ▼
 middleware.js
 ├── Security headers (CSP, HSTS, COOP, CORP, X-Frame-Options, …)
 └── If path is admin-scoped, verify JWT + role=admin before letting through
        │
        ▼
 runScraper:
        ├── 1. verifyApiKey    — x-api-key required (bcrypt + lastUsedAt bump)
        ├── 2. applyRateLimit  — Redis sliding window per IP
        ├── 3. Zod parse       — validates input; rejects NoSQL operators
        ├── 4. getCache        — return early on Redis hit (no upstream call)
        ├── 5. dedup           — coalesce identical in-flight requests
        ├── 6. withRetry       — up to 3 attempts, exponential backoff
        ├── 7. scrape          — your function: SSRF-safe fetch + parse
        ├── 8. setCache        — store result with TTL
        └── 9. logApiMetric    — Mongo ApiLog + Prometheus + Socket.IO + IP analytics
                    │
                    ▼
             BullMQ (heavy async jobs)
                    │
                    ▼
             scraper.worker.js (separate process)
```

---

## API endpoints

### Public (no auth)
| Endpoint | Description |
|---|---|
| `GET /api/health` | Mongo + Redis status, suitable for load balancers. No internals exposed. |
| `GET /api/features` | Scraper catalogue from `features.json`. 60s in-memory cache. |
| `POST /api/views/index` | Page-view counter with 5-minute Redis debounce per IP/slug. |

### Auth flow
| Endpoint | Description |
|---|---|
| `POST /api/auth/send-otp` | Send registration OTP. Generic 200 regardless of email existence. |
| `POST /api/auth/verify-otp` | Verify OTP + create account; returns one-time `apiKey`. |
| `POST /api/auth/forgot-password` | Request reset link by email. Generic 200. |
| `POST /api/auth/reset-password` | Consume reset token, set new password, clear lockout. |
| `POST /api/auth/callback/credentials` | NextAuth sign-in. Email + password. |

### Authenticated user (session cookie)
| Endpoint | Description |
|---|---|
| `GET /api/user/data` | Current user profile (no secrets). |
| `POST /api/user/update` | Update username / image (strict schema; role/password rejected). |
| `GET /api/stats/requests` | Per-user request stats (24h hourly + totals). |
| `GET /api/user/api-keys` | List your active and revoked keys. |
| `POST /api/user/api-keys` | Issue a new key (returns plaintext ONCE). |
| `DELETE /api/user/api-keys/:keyId` | Revoke a key you own. |

### API key (x-api-key header)
| Endpoint | Description |
|---|---|
| `GET /api/github/user?username=…` | GitHub user profile. 10-min cache. |
| `GET /api/github/repos?username=…&page=&perPage=&sort=` | Paginated repos. 5-min cache. |
| `GET /api/github/repo?owner=…&name=…` | Single repo detail. 5-min cache. |
| `GET /api/uploads?filename=…` | Serves files under `tmp/` (strict filename allow-list). |

### Admin (session cookie + `role: 'admin'`)
| Endpoint | Description |
|---|---|
| `GET /api/admin/users` | List/search/filter users. |
| `GET /api/admin/users/:id` | Single user detail (+ active key count). |
| `PATCH /api/admin/users/:id` | Update role / disabled / endDate. |
| `POST /api/admin/users/:id/disable` | Disable account. |
| `POST /api/admin/users/:id/enable` | Enable + clear lockout. |
| `DELETE /api/admin/users/:id/api-keys/:keyId` | Admin-side key revoke. |
| `GET /api/admin/audit-log` | Paginated audit log (filter by actor/target/action). |
| `GET /api/dashboard/*` | Dashboard data (system, queue, charts, advanced…). |

### Admin (`x-admin-key` header — for ops tools)
| Endpoint | Description |
|---|---|
| `GET /api/prometheus` | Prometheus scrape. Fails closed if `ADMIN_KEY` unset. |
| `GET /api/docs` | OpenAPI 3.0 spec (all 38 routes annotated). Import to Postman/Insomnia or feed to openapi-generator-cli. See [docs/OPENAPI.md](./docs/OPENAPI.md). |

---

## Authentication flows

### Registration

1. `POST /api/auth/send-otp { email }` → generic 200. If the address is registered, no email is sent and the response is **indistinguishable** from the new-user case (timing jittered).
2. `POST /api/auth/verify-otp { username, email, password, otp }` → on success returns `{ apiKey, apiKeyId }` **once**. Save it. The server only stores the bcrypt hash.

Brute-force defences on `/verify-otp`:
- Per-OTP attempt cap (5).
- Per-(IP, email) limit: 10 attempts / 10 min.
- Per-IP global limit: 50 attempts / 10 min.

### Login

`signIn('credentials', { email, password })` via NextAuth.
- Per-IP limit (20 / 10 min) — fail-fast before bcrypt to defeat CPU-DoS.
- Per-(IP, email) limit (10 / 10 min).
- Per-account lockout (5 failures → 15-min lock).
- bcrypt runs against a boot-generated dummy hash (via `getFakeHash()`) when the user doesn't exist *or* the account is locked, so timing never reveals the difference. The hash is computed once at process start (~250 ms) and cached for the lifetime of the process.
- All counters wipe on successful login.

### Password reset

1. `POST /api/auth/forgot-password { email }` → generic 200.
2. User clicks the emailed link, lands on `/auth/reset-password?token=…`.
3. `POST /api/auth/reset-password { token, password }` → token is hashed-and-claimed atomically (rejects reuse), password updated, all pending tokens for that user wiped, lockout cleared.

### Admin access

A user is an admin if their User document has `role: 'admin'`. Both the edge middleware and each protected route verify `token.role === 'admin'`.

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

Fill in the values — see [Environment Variables](#environment-variables) below.

> ⚠️ The server **refuses to start in production** if any of `NEXTAUTH_SECRET`, `JWT_SECRET`, `ADMIN_KEY`, or `ALLOWED_ORIGIN` are missing or shorter than 32 characters (see `lib/auth/env.js`).

### 4. Run in development

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — BullMQ worker (required for queue-based jobs)
npm run worker
```

### 5. Run the test suite

```bash
npm test           # one-off
npm run test:watch # watch mode while developing
```

---

## Production deployment

### Option A — PM2

```bash
npm run build
npx pm2 start ecosystem.config.js
```

### Option B — Docker Compose

```bash
docker-compose up --build
```

Services: `api` (port 3000), `worker`, `redis`, `mongodb`. **`redis` and `mongodb` are intentionally not published to the host** — they're reachable only from the compose network. If you need host access, bind explicitly to `127.0.0.1:` (never `0.0.0.0`).

---

## Environment Variables

```env
# ── App
PORT=3000
NODE_ENV=production
ALLOWED_ORIGIN=https://yourdomain.com      # Socket.IO CORS origin; comma-separated for multiple
TRUSTED_PROXIES=10.0.0.5,10.0.0.6          # IPs of your LB/proxy; required for accurate rate-limit keys

# ── Auth
NEXTAUTH_SECRET=                           # required, >=32 chars (openssl rand -hex 32)
NEXTAUTH_URL=https://yourdomain.com        # required in prod — must be your real domain
JWT_SECRET=                                # required, >=32 chars

# ── Database
MONGODB_URI=                               # required
MONGO_USER=                                # required if using the docker-compose mongo service
MONGO_PASS=                                # required if using the docker-compose mongo service

# ── Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=                            # required in prod

# ── Admin
ADMIN_KEY=                                 # protects /api/prometheus and /api/docs (>=32 chars)
                                           # openssl rand -hex 32

# ── Email (OTP + password reset)
EMAIL_USER=
EMAIL_PASS=

# ── GitHub scraper (optional)
GITHUB_TOKEN=                              # 60/hr anonymous -> 5000/hr authenticated
                                           # https://github.com/settings/tokens (no scopes needed)

# ── OAuth 2.0 / OIDC sign-in (optional, V11)
# Each provider is enabled by setting BOTH its CLIENT_ID and CLIENT_SECRET.
# Half-configured (only one set) = boot refusal. Unset both = provider disabled.
# After configuring, redirect URI on the provider side is:
#   https://yourdomain.com/api/auth/callback/<provider>
GOOGLE_CLIENT_ID=                          # from https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=                          # from https://github.com/settings/developers
GITHUB_CLIENT_SECRET=

# ── SIEM forwarding (optional)
SIEM_AUDIT_PATH=                           # absolute path to NDJSON file the SIEM agent reads.
                                           # e.g. /var/log/orbitnode/audit.json
                                           # Unset = disabled. See docs/SIEM.md.
```

---

## API usage

```bash
# Issue a key (via UI) then:
export KEY="<keyId>.<secret>"

# GitHub demo
curl -s "http://localhost:3000/api/github/user?username=octocat" \
  -H "x-api-key: $KEY" | jq

curl -s "http://localhost:3000/api/github/repos?username=octocat&perPage=5" \
  -H "x-api-key: $KEY" | jq

curl -s "http://localhost:3000/api/github/repo?owner=octocat&name=Hello-World" \
  -H "x-api-key: $KEY" | jq
```

**Rate limit:** 100 requests per 60 seconds per IP. Exceeding this returns `429` with a 5-minute block.

---

## Project structure

```
/app
├── api/
│   ├── admin/users/[id]/...          user-management API 
│   ├── admin/audit-log/              audit log API
│   ├── auth/[...nextauth]/           NextAuth handler (re-exports authOptions)
│   ├── auth/forgot-password/         password reset request
│   ├── auth/reset-password/          password reset claim
│   ├── dashboard/                    all routes require admin session
│   ├── docs/                         Swagger/OpenAPI (admin-key)
│   ├── features/                     scraper catalogue
│   ├── github/{user,repos,repo}/     demo scraper endpoints
│   ├── health/                       public health check
│   ├── prometheus/                   Prometheus scrape (admin-key)
│   ├── socket/                       Socket.IO init (admin session)
│   ├── stats/requests/               per-user stats
│   ├── uploads/                      api-key gated file serving
│   ├── user/data/                    current user (powers useUser hook)
│   ├── user/update/                  profile self-edit
│   ├── user/api-keys/                self-service key management
│   └── views/index/                  page-view counter
├── admin/                            admin home (Server Component)
├── admin/users/                      user management UI
├── admin/audit-log/                  audit log viewer UI
├── auth/{login,register,forgot-password,reset-password}/
├── user/{profile,api-keys}/
└── dashboard/

/lib
├── auth/
│   ├── apiKeys.js                    generateApiKey, issueApiKey
│   ├── adminKey.js                   timing-safe ADMIN_KEY check
│   ├── authOptions.js                NextAuth config (centralised)
│   ├── env.js                        boot-time secret validation
│   ├── loginLockout.js               per-account lockout state
│   ├── loginRateLimit.js             per-IP + per-(IP,email) login limiters
│   ├── otpRateLimit.js               OTP verify limiters
│   ├── passwordResetRateLimit.js     reset request/verify limiters
│   ├── requireAdmin.js               admin guard (returns Response | null)
│   ├── requireSession.js             session guard
│   ├── requireJson.js                content-type guard / CSRF mitigation
│   └── timing.js                     jitter helpers
├── middleware/
│   ├── adminRateLimit.js
│   ├── apiKey.js                     verifyApiKey (split-key + bcrypt + revoked check)
│   └── requestLogger.js
├── scrapers/
│   ├── githubClient.js               SSRF-safe wrapper around api.github.com
│   └── runScraper.js                 the 9-step pipeline
├── security/
│   └── ssrf.js                       validateUrl + safeFetch
├── validators/
│   ├── admin.js
│   ├── auth.js
│   ├── github.js
│   └── user.js
├── abuseDetection.js                 Redis sliding-window abuse counter
├── audit.js                          writeAudit (never throws, redacts secrets)
├── cache.js
├── clientIp.js                       anti-spoof IP extraction
├── downloadFile.js                   uses safeFetch + validateUpload
├── ipAnalytics.js                    Redis-backed top-IP analytics
├── logger.js                         pino (pretty in dev, JSON in prod)
├── prometheus.js
├── rateLimit.js
├── redis.js
├── retry.js
├── socket.js                         fail-closed CORS
├── swagger.js
├── telemetry.js
└── uploadValidation.js               magic-byte check

/models
├── apiKey.js                         per-key document (label, lastUsedAt, revoked)
├── apiLog.js                         per-request log
├── auditLog.js                       admin actions
├── otp.js                            OTP codes + attempt counter
├── pageView.js
├── passwordReset.js                  hashed reset tokens
└── user.js                           users (+ failedLoginAttempts, lockUntil)

/tests
├── audit.test.js
├── helpers.test.js
├── imports.test.js                   guards against renames that leave dangling imports
├── ssrf.test.js
└── validators.test.js

/.github
├── workflows/ci.yml                  audit + lint + test
└── dependabot.yml                    weekly grouped updates

/public/.well-known/security.txt      RFC 9116 disclosure pointer
SECURITY.md                           disclosure policy
```

---

## Security reporting

See [`SECURITY.md`](./SECURITY.md). **Do not file public issues for vulnerabilities** — use GitHub's [private vulnerability reporting](https://github.com/Cosm1cBug/rest-api/security/advisories/new).

---

## License

Copyright (c) 2026 COSMICBUG

All rights reserved. This source code and associated files may not be copied, modified, distributed, sublicensed, commercialized, or used in any form without explicit written permission from the author. Unauthorized use is strictly prohibited.

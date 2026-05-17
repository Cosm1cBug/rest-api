# ORBITNODE API — Adding New APIs & Endpoints Guide

This guide explains how to properly add new APIs, integrate scrapers/services, wire telemetry, caching, queues, metrics, and security into your ORBITNODE API platform.

---

# Overview

Your platform is now structured as a production-grade modular API system.

Every new endpoint should ideally support:

- validation
- SSRF protection
- telemetry logging
- Redis caching
- rate limiting
- API key verification
- retry handling
- queue offloading (optional)
- Prometheus metrics
- realtime dashboard updates

---

# Creating a New API Endpoint

Example:

```text
/api/instagram
```

---

# STEP 1 — Create Route File

## File Path

```text
/app/api/instagram/route.js
```

---

# STEP 2 — Basic Route Structure

```js
import { success, failure }
from '@/lib/apiResponse.js'

import { handleError }
from '@/lib/errorHandler.js'

import { requestLogger }
from '@/lib/middleware/requestLogger.js'

import { verifyApiKey }
from '@/lib/middleware/apiKey.js'

import { applyRateLimit }
from '@/lib/rateLimit.js'

import { validateUrl }
from '@/lib/security/ssrf.js'

import { getCache, setCache }
from '@/lib/cache.js'

import { dedupe }
from '@/lib/inflight.js'

import { withRetry }
from '@/lib/retry.js'

import { instagram }
from '@/lib/scrapers/instagram.js'
```

---

# Adding a Scraper

## File Path

```text
/lib/scrapers/instagram.js
```

---

# Queue-Based APIs

Heavy APIs should use BullMQ.

Examples:

- AI generation
- large scraping
- media conversion
- video downloading
- OCR
- transcoding

---

# Queue Job Example

```js
await scraperQueue.add(
    'instagram-job',
    {
        url
    },
    {
        attempts: 3,

        backoff: {
            type: 'exponential',
            delay: 2000
        }
    }
)
```

---

# Adding Dashboard Metrics

Your telemetry system automatically supports:

- request counts
- endpoint usage
- latency
- status codes
- IP analytics

---

# Security Best Practices

Every public endpoint should include:

- API key verification
- rate limiting
- SSRF validation
- retry protection
- timeout handling
- abuse detection

---

# Recommended Cache Durations

| API Type | Cache Time |
|---|---|
| Metadata | 1 hour |
| Search | 10 minutes |
| Trending | 5 minutes |
| User data | 1 minute |
| AI responses | 24 hours |

---

# Suggested API Categories

## Download APIs

- YouTube
- Instagram
- TikTok
- Spotify
- Pinterest

## Utility APIs

- QR generator
- URL shortener
- Screenshot API
- Metadata extractor

## AI APIs

- Chat AI
- Image generation
- OCR
- Transcription
- Translation

## Security APIs

- DNS lookup
- WHOIS
- Port scanning
- SSL checker

---
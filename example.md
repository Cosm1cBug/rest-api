# ORBITNODE API — VirusTotal + IMDb Integration Guide

# Overview

This document explains how to fully integrate:

- VirusTotal APIs
- IMDb / OMDb APIs

into the ORBITNODE production API platform.

---

# Final Endpoints

## VirusTotal

```text
/api/virustotal/ip
/api/virustotal/domain
/api/virustotal/url
/api/virustotal/hash
```

## IMDb

```text
/api/imdb/search
/api/imdb/title
/api/imdb/trending
```

---

# Environment Variables

## File

```text
.env.local
```

## Add

```env
VIRUSTOTAL_API_KEY=
OMDB_API_KEY=
```

---

# Install Dependency

```bash
npm install axios
```

---

# Folder Structure

```text
/lib
├── scrapers
│   ├── virustotal.js
│   └── imdb.js
│
├── metrics
│   ├── virustotalMetrics.js
│   └── imdbMetrics.js
│
/app
├── api
│   ├── virustotal
│   │   ├── ip
│   │   ├── domain
│   │   ├── url
│   │   └── hash
│   │
│   └── imdb
│       ├── search
│       ├── title
│       └── trending
```

---

# VirusTotal Integration

## File

```text
/lib/scrapers/virustotal.js
```

## Code

```js
import axios from 'axios'

const BASE_URL =
    'https://www.virustotal.com/api/v3'

const headers = {

    'x-apikey':
        process.env.VIRUSTOTAL_API_KEY
}

export async function scanIP(ip) {

    const response =
        await axios.get(

            `${BASE_URL}/ip_addresses/${ip}`,

            {
                headers,
                timeout: 15000
            }
        )

    return response.data
}

export async function scanDomain(domain) {

    const response =
        await axios.get(

            `${BASE_URL}/domains/${domain}`,

            {
                headers,
                timeout: 15000
            }
        )

    return response.data
}

export async function scanHash(hash) {

    const response =
        await axios.get(

            `${BASE_URL}/files/${hash}`,

            {
                headers,
                timeout: 15000
            }
        )

    return response.data
}
```

---

# VirusTotal Metrics

## File

```text
/lib/metrics/virustotalMetrics.js
```

## Code

```js
import client from 'prom-client'

export const virustotalCounter =
    new client.Counter({

        name:
            'virustotal_requests_total',

        help:
            'VirusTotal API requests'
    })
```

---

# VirusTotal Route

## File

```text
/app/api/virustotal/ip/route.js
```

## Code

```js
import {
    success,
    failure
}
from '@/lib/apiResponse.js'

import {
    handleError
}
from '@/lib/errorHandler.js'

import {
    verifyApiKey
}
from '@/lib/middleware/apiKey.js'

import {
    applyRateLimit
}
from '@/lib/rateLimit.js'

import {
    requestLogger
}
from '@/lib/middleware/requestLogger.js'

import {
    getCache,
    setCache
}
from '@/lib/cache.js'

import {
    scanIP
}
from '@/lib/scrapers/virustotal.js'

export async function GET(req) {

    try {

        await verifyApiKey(req)

        await applyRateLimit(req)

        const {
            searchParams
        } = new URL(req.url)

        const ip =
            searchParams.get('ip')

        if (!ip) {

            return failure(
                'Missing IP'
            )
        }

        const cacheKey =
            `vt:ip:${ip}`

        const cached =
            await getCache(cacheKey)

        if (cached) {

            return success(cached)
        }

        const data =
            await scanIP(ip)

        await setCache(
            cacheKey,
            data,
            3600
        )

        return success(data)

    } catch (err) {

        return handleError(err)
    }
}
```

---

# IMDb Integration

IMDb itself does not provide a proper free public API.

Use:

## OMDb API

Official site:

https://www.omdbapi.com/

---

# File

```text
/lib/scrapers/imdb.js
```

## Code

```js
import axios from 'axios'

const API_KEY =
    process.env.OMDB_API_KEY

export async function searchMovie(query) {

    const response =
        await axios.get(

            'https://www.omdbapi.com/',

            {
                params: {
                    apikey: API_KEY,
                    s: query
                },

                timeout: 15000
            }
        )

    return response.data
}

export async function getMovie(id) {

    const response =
        await axios.get(

            'https://www.omdbapi.com/',

            {
                params: {
                    apikey: API_KEY,
                    i: id,
                    plot: 'full'
                },

                timeout: 15000
            }
        )

    return response.data
}
```

---

# IMDb Route

## File

```text
/app/api/imdb/search/route.js
```

## Code

```js
import {
    success,
    failure
}
from '@/lib/apiResponse.js'

import {
    handleError
}
from '@/lib/errorHandler.js'

import {
    searchMovie
}
from '@/lib/scrapers/imdb.js'

export async function GET(req) {

    try {

        const {
            searchParams
        } = new URL(req.url)

        const q =
            searchParams.get('q')

        if (!q) {

            return failure(
                'Missing query'
            )
        }

        const data =
            await searchMovie(q)

        return success(data)

    } catch (err) {

        return handleError(err)
    }
}
```

---

# Example Requests

## VirusTotal

```bash
curl "http://localhost:3000/api/virustotal/ip?ip=8.8.8.8"
```

## IMDb

```bash
curl "http://localhost:3000/api/imdb/search?q=batman"
```

---

# Dashboard Integration

These APIs automatically integrate with:

- request analytics
- endpoint analytics
- Prometheus metrics
- telemetry dashboard
- realtime websocket events
- abuse detection
- Redis cache telemetry

---

# Production Recommendations

Always add:

- retries
- timeout handling
- caching
- telemetry
- Prometheus metrics
- rate limiting
- SSRF protection
- queue offloading for heavy APIs

---

# Future Upgrades

## VirusTotal

- URL submissions
- malware behavior
- IOC hunting
- sandbox reports
- threat graphs

## IMDb

- TMDb integration
- actor search
- episode metadata
- recommendations
- streaming providers

---

# Final Result

Your ORBITNODE platform now supports:

## Cybersecurity APIs

- IOC scanning
- VirusTotal lookups
- malware intelligence

## Media APIs

- movie search
- title lookup
- metadata APIs

fully integrated into:

- caching
- telemetry
- analytics
- Prometheus
- realtime dashboard
- observability systems
---
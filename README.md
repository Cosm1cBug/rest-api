# ORBITNODE API

Production-grade API platform built with Next.js App Router, Redis, MongoDB, BullMQ, Socket.IO, Prometheus telemetry, realtime observability, and distributed worker architecture.

---

# Features

## Core API Platform

- Next.js App Router backend
- Modular API architecture
- Redis caching layer
- MongoDB persistence
- BullMQ distributed job queues
- Socket.IO realtime telemetry
- API key authentication
- Request analytics
- Retry system
- Inflight request deduplication
- Global queue management

---

# Production Observability

## Dashboard Features

- Live request feed
- Hourly traffic analytics
- Latency analytics
- Cache hit ratio tracking
- Top endpoint analytics
- Top user analytics
- Queue telemetry
- Worker monitoring
- IP analytics
- System telemetry
- Realtime websocket updates

---

# Security Features

## Protection Layers

- SSRF protection
- Abuse detection
- Rate limiting
- API key verification
- Request logging
- Suspicious IP detection
- Redis-backed throttling
- Queue retry protection

---

# Architecture

```text
Client
   ↓
Next.js API Routes
   ↓
Middleware Layer
   ↓
Redis Cache
   ↓
MongoDB Storage
   ↓
BullMQ Queue
   ↓
Workers
   ↓
Realtime Telemetry
   ↓
Dashboard / Prometheus
```

---

# Tech Stack

## Backend

- Next.js
- Node.js
- MongoDB
- Mongoose
- Redis
- BullMQ
- Socket.IO
- Prometheus

## Frontend

- React
- TailwindCSS
- Recharts

## Monitoring

- Prometheus Metrics
- Realtime WebSockets
- Internal Telemetry Engine

---

# Project Structure

```text
/app
├── api
│   ├── dashboard
│   ├── health
│   ├── metrics
│   └── youtube
├── dashboard
├── layout.jsx
├── page.jsx
└── globals.css

/components
├── navbar.jsx
├── providers.jsx
└── alert.jsx

/lib
├── abuseDetection.js
├── apiResponse.js
├── bullmq.js
├── cache.js
├── errorHandler.js
├── inflight.js
├── ipAnalytics.js
├── liveMetrics.js
├── logger.js
├── metricsLogger.js
├── mongodb.js
├── prometheus.js
├── queue.js
├── queueTelemetry.js
├── rateLimit.js
├── redis.js
├── retry.js
├── shutdown.js
├── socket.js
├── telemetry.js
└── security
    └── ssrf.js

/models
├── apiLog.js
├── otp.js
└── user.js

/workers
└── scraper.worker.js
```

---

# Installation

## Clone Repository

```bash
git clone <repository-url>
cd rest-api
```

## Install Dependencies

```bash
npm install
```

---

# Environment Variables

Create a `.env.local` file.

```env
MONGODB_URI=
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

---

# Development

```bash
npm run dev
```

---

# Production

## Build

```bash
npm run build
```

## Start

```bash
npm start
```

---

# PM2 Deployment

```bash
npx pm2 start ecosystem.config.cjs
```

---

# Healthcheck Endpoint

```text
/api/health
```

---

# Prometheus Metrics

```text
/api/metrics
```

---

# Queue System

- retries
- exponential backoff
- concurrency
- queue telemetry
- failed job tracking
- completed job tracking
- delayed jobs

---

# Telemetry Engine

Tracks:
- requests
- failed requests
- successful requests
- latency
- active requests
- cache hits
- cache misses
- worker metrics
- endpoint usage
- status codes

---

# Dashboard APIs

```text
/api/dashboard/telemetry
/api/dashboard/queue
/api/dashboard/charts
/api/dashboard/ip
/api/dashboard/system
```

---

# Security

## SSRF Protection

The platform blocks:
- localhost access
- internal IP ranges
- loopback addresses
- private network abuse

---

# Abuse Detection

Automatically detects:
- request floods
- suspicious IP activity
- excessive traffic spikes

---

# Scaling Strategy

Supports:
- PM2 clustering
- distributed workers
- Redis-based queues
- websocket telemetry
- Prometheus scraping

---

# License

Copyright (c) 2026 COSMICBUG

All rights reserved.

This source code and associated files may not be copied,
modified, distributed, sublicensed, commercialized,
or used in any form without explicit written permission
from the author.

Unauthorized use is strictly prohibited.

---
/**
 * V13 integration-test harness.
 *
 * Boots a real in-memory MongoDB (via mongodb-memory-server) and a
 * Redis mock (via ioredis-mock) per vitest worker, BEFORE any test
 * file is loaded. Sets MONGODB_URI / REDIS_HOST / REDIS_PORT so that
 * lib/mongodb.js and lib/redis.js connect to the harnessed services
 * rather than trying to reach a real cluster.
 *
 * Why this matters
 * ────────────────
 * Integration tests in this project target the V9-3 / V10-2.2 bug class:
 * bugs that pass unit tests + build but break on real Mongo or Redis.
 * For example:
 *
 *   - V9-3: models/apiLog.js was missing the requestId field the writer
 *     expected. Unit tests of the writer module didn't notice because they
 *     mocked the model. An integration test that calls writeAudit() and
 *     then queries the auditlogs collection would catch it.
 *
 *   - V10-2.2: instrumentation.js's SIEM-init code worked in unit tests
 *     (vitest's loader resolves 'fs' natively) but crashed under Next.js's
 *     webpack-bundled runtime. An integration test that boots next start
 *     against the in-memory Mongo + mock Redis would NOT have caught this
 *     specific webpack quirk, but it WOULD have caught the symptom (SIEM
 *     events never written) once the file IO path was reached.
 *
 *   - V11-1.5 (hypothetical V11 OAuth analog): an integration test that
 *     simulates a Google sign-in callback hitting the User collection
 *     would catch oauthLink.js bugs that unit tests with mocked Models miss.
 */

import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { vi } from 'vitest'
import RedisMock from 'ioredis-mock'

// Module-level so the harness state survives across test files in the
// same worker. setup() and teardown() are idempotent.
let mongo = null
let started = false

export async function startTestEnv() {
    if (started) return
    started = true

    // ── MongoDB ──
    mongo = await MongoMemoryServer.create({
        binary: {
            // Pin a version so CI is reproducible. mongodb-memory-server
            // downloads the binary on first run and caches it.
            version: '7.0.14'
        }
    })
    process.env.MONGODB_URI = mongo.getUri()

    // Connect mongoose right here so the rest of the app picks up the
    // active connection through lib/mongodb.js's cached promise pattern.
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI)
    }

    // ── Redis ──
    // Override ioredis with the mock at the module level. lib/redis.js
    // does `new Redis(...)` from 'ioredis' — vi.mock replaces that.
    // This MUST be done before any code under test imports lib/redis.js,
    // which is why setupFiles runs setup.js before suites are collected.
    vi.mock('ioredis', () => ({
        default: RedisMock,
        Redis: RedisMock
    }))

    // Set the env vars too so any code that reads them directly (e.g.
    // for connection-string assembly) gets sane defaults.
    process.env.REDIS_HOST = '127.0.0.1'
    process.env.REDIS_PORT = '6379'

    // The fake-hash module memoizes — but it's a one-time bcrypt(12)
    // computation, ~250ms. Letting it run lazily is fine.

    // Boot-time secret guard wants these set even for integration tests
    // running under NODE_ENV=test (since some assertions skip on
    // production-only checks). 32+ chars to satisfy isWeak().
    process.env.NEXTAUTH_SECRET ||= 'integration-test-nextauth-secret-32-chars-min'
    process.env.JWT_SECRET      ||= 'integration-test-jwt-secret-32-chars-minimum'
    process.env.ALLOWED_ORIGIN  ||= 'http://localhost:3000'
}

export async function stopTestEnv() {
    if (mongoose.connection.readyState !== 0) {
        // Drop the database so a re-run of the same test file starts clean.
        await mongoose.connection.dropDatabase()
        await mongoose.disconnect()
    }
    if (mongo) {
        await mongo.stop()
        mongo = null
    }
    started = false
}

// Convenience: vitest's `setupFiles` config option runs this before all
// suites in a worker. Returning a function makes it a teardown hook
// per Vitest's contract. Named to silence import/no-anonymous-default-export.
async function vitestSetup() {
    await startTestEnv()
    return async () => { await stopTestEnv() }
}

export default vitestSetup

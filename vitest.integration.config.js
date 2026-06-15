import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * V13 integration-test config — `npm run test:int`.
 *
 * Runs ONLY tests/integration/**\/*.int.test.js. These spin up:
 *   - A real in-memory MongoDB via mongodb-memory-server
 *   - The ioredis mock (vi.mock('ioredis', ...) in setup.js)
 *
 * Why a separate config rather than just merging into the default?
 * ────────────────────────────────────────────────────────────────
 *   - First run downloads ~150 MB of mongod binary. Don't want that on
 *     the watch-mode unit-test loop.
 *   - testTimeout is bumped to 30s — Mongo memory server startup +
 *     mongoose connect + bcrypt(12) for the fake-hash can run long on
 *     cold caches.
 *   - setupFiles loads tests/integration/setup.js which boots Mongo
 *     and stubs ioredis BEFORE any test file is collected.
 *
 * CI runs this in a separate job (see .github/workflows/ci.yml).
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/integration/**/*.int.test.js'],
        setupFiles: ['tests/integration/setup.js'],
        testTimeout: 30_000,
        hookTimeout: 60_000,    // mongodb-memory-server first-run download
        // Run integration suites sequentially. They share state via the
        // singleton Mongo/Redis (per-worker), so running in parallel
        // across multiple workers would just multiply the binary download
        // cost without speeding anything up.
        pool: 'forks',
        poolOptions: { forks: { singleFork: true } }
    },
    css: {
        postcss: {}
    },
    resolve: {
        alias: {
            '@': path.resolve(process.cwd())
        }
    }
})

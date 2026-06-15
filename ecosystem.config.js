/**
 * PM2 process configuration for OrbitNode production deployment.
 *
 * V5-5 cleanup (batch 1, item #4): the previous version included an
 * `orbitnode-dashboard` PM2 app that ran `npm run dashboard` (=
 * `next dev`) as a separate process on port 3001. That was a leftover
 * from the V5 era when the dashboard lived in its own dev server; it's
 * been part of the main app under `/dashboard/*` for months. Running
 * `next dev` in production was wrong on multiple axes:
 *   - serves dev-mode bundles (slower, with React DevTools hooks)
 *   - opens an extra port that has no production traffic but counts
 *     against rate-limit budgets
 *   - has its own duplicate Mongo/Redis connections
 *
 * Removed cleanly. Today's prod is just two processes:
 *   - orbitnode-api      — Next.js server on the configured PORT
 *   - scraper-worker     — BullMQ worker, no HTTP listener
 *
 * If you actually need a separate process for any reason in the future,
 * use `next start` not `next dev`.
 */

const apiApp = {
    name: 'orbitnode-api',
    script: 'npm',
    args: 'start -- -p 3000',
    instances: '1',
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
        NODE_ENV: 'production',
        PORT: 3000
    }
}

const workerApp = {
    name: 'scraper-worker',
    script: 'workers/scraper.worker.js',
    autorestart: true,
    env: {
        NODE_ENV: 'production'
    }
}

// V5-5 #5 cosmetic ESLint fix — wrap the default-exported config in a
// named const so `import/no-anonymous-default-export` doesn't warn.
const ecosystemConfig = {
    apps: [apiApp, workerApp]
}

export default ecosystemConfig

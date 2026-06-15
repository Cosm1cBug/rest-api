import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest configuration — DEFAULT unit-test run (`npm test`).
 *
 * Notes:
 *   - We mirror the `@/` path alias Next.js uses so tests can import
 *     project files the same way the app does.
 *   - css.postcss: {} disables Vite's automatic PostCSS resolution.
 *     We do not exercise any CSS in unit tests, and the project ships
 *     a Tailwind v4 PostCSS config whose plugin shape Vite refuses to
 *     parse — bypassing it entirely is the cleanest fix.
 *   - environment: 'node' — these are unit tests; they don't render React.
 *
 * Exclude tests/integration/**\/*.int.test.js. Integration suites
 * boot mongodb-memory-server (which downloads a ~150MB binary on first
 * run), so they're slow and we keep them on a separate `test:int` script.
 * See vitest.integration.config.js.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.js'],
        exclude: [
            'node_modules/**',
            '.next/**',
            // Integration suites run via `npm run test:int`.
            'tests/integration/**'
        ],
        dangerouslyIgnoreUnhandledErrors: false,
        testTimeout: 10_000
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

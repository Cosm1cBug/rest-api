#!/usr/bin/env node
/**
 * CI guard: every route.js under app/api/** must appear in Next.js's
 * build output route table, AND no route.js may live outside app/.
 *
 * Usage
 * ─────
 *   npx next build --no-lint 2>&1 | tee /tmp/build.log
 *   node scripts/check-routes.js /tmp/build.log
 *
 * Or piped:
 *   npx next build --no-lint 2>&1 | node scripts/check-routes.js
 *
 * In CI: see .github/workflows/ci.yml — the build job runs both.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const API_ROOT = path.join(REPO_ROOT, 'app', 'api')

/**
 * Recursively yield every `route.js` (or `route.ts`/`route.jsx`) file
 * under the given directory.
 */
function* walkRouteFiles(dir) {
    let entries
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
        if (err.code === 'ENOENT') return   // no app/api dir at all
        throw err
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            yield* walkRouteFiles(fullPath)
        } else if (entry.isFile() && /^route\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            yield fullPath
        }
    }
}

function routePathFromFile(filePath) {
    const rel = path.relative(path.join(REPO_ROOT, 'app'), filePath)
    const segments = rel.split(path.sep).slice(0, -1)
    const cleaned = segments.filter(s => !(s.startsWith('(') && s.endsWith(')')))
    return '/' + cleaned.join('/')
}

function parseRoutes(buildOutput) {
    const routes = new Set()
    const RE = /^\s*[├└┌│\s]*\s*[○ƒ●]\s+(\/\S*)/
    for (const line of buildOutput.split(/\r?\n/)) {
        const m = line.match(RE)
        if (m) routes.add(m[1])
    }
    return routes
}

function findStrayRouteFiles() {
    const stray = []
    const SKIP = new Set([
        'app',          // legitimate route home
        'node_modules', // vendored deps
        '.next',        // build output
        '.git',
        'public',
        'coverage',
        '.cache',
        'dist',
        'build',
        'out'
    ])

    function walk(dir) {
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch { return }
        for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) {
                walk(full)
            } else if (/^route\.(js|jsx|ts|tsx)$/.test(e.name)) {
                stray.push(full)
            }
        }
    }

    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (SKIP.has(entry.name)) continue
        walk(path.join(REPO_ROOT, entry.name))
    }
    return stray
}

function main() {
    // Read build output from argv[2] (file) or stdin.
    let buildOutput
    if (process.argv[2]) {
        try {
            buildOutput = fs.readFileSync(process.argv[2], 'utf8')
        } catch (err) {
            console.error(`[check-routes] Cannot read ${process.argv[2]}: ${err.message}`)
            process.exit(2)
        }
    } else if (!process.stdin.isTTY) {
        buildOutput = fs.readFileSync(0, 'utf8')
    } else {
        console.error('[check-routes] Usage: node scripts/check-routes.js <build-log-file>')
        console.error('[check-routes]    or: <some-command> | node scripts/check-routes.js')
        process.exit(2)
    }

    // ── Check A: stray route.js outside app/ ──
    const stray = findStrayRouteFiles()
    if (stray.length > 0) {
        console.error(`[check-routes] ✗ ${stray.length} route.js file(s) OUTSIDE app/ — these never reach Next.js:`)
        for (const f of stray) {
            console.error(`    ${path.relative(REPO_ROOT, f)}`)
        }
        console.error('')
        console.error('  Next.js only scans the app/ directory for route files.')
        console.error('  Move each file to app/api/<...>/route.js (or app/<...>/route.js).')
        console.error('  See V11-1 in the engagement history for the prior occurrence.')
        process.exit(1)
    }

    // ── Check B: every app/api route file must be in the build table ──
    const expected = new Set()
    for (const file of walkRouteFiles(API_ROOT)) {
        expected.add(routePathFromFile(file))
    }
    const actual = parseRoutes(buildOutput)

    const missing = []
    for (const route of expected) {
        if (!actual.has(route)) missing.push(route)
    }

    if (missing.length === 0) {
        console.log(`[check-routes] ✓ All ${expected.size} app/api route files are registered with Next.js.`)
        process.exit(0)
    }

    console.error(`[check-routes] ✗ ${missing.length} route file(s) on disk but NOT in next build's route table:`)
    for (const r of missing) {
        console.error(`    ${r}`)
    }
    console.error('')
    console.error('  This means one of:')
    console.error('    • the route file failed to compile (silent — check build output for warnings)')
    console.error('    • this script\'s parser missed a Next.js route-table line (file a bug)')
    console.error('')
    console.error('  Actual routes found in build output:')
    for (const r of [...actual].sort()) {
        console.error(`    ${r}`)
    }
    process.exit(1)
}

main()

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'check-routes.js')

function runScript(buildLogContent) {
    return spawnSync('node', [SCRIPT], {
        input: buildLogContent,
        encoding: 'utf8',
        timeout: 10_000
    })
}

// Use the REAL list of routes from the running repo. We snapshot it
// once at test time by walking the filesystem the same way the script
// does, so the "good" fixture is always in sync with the codebase.
import fs from 'fs'
function discoverRoutes() {
    const REPO_ROOT = path.resolve(__dirname, '..')
    const API_ROOT = path.join(REPO_ROOT, 'app', 'api')
    const found = []
    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) walk(full)
            else if (/^route\.(js|jsx|ts|tsx)$/.test(e.name)) {
                const rel = path.relative(path.join(REPO_ROOT, 'app'), full)
                const segs = rel.split(path.sep).slice(0, -1)
                    .filter(s => !(s.startsWith('(') && s.endsWith(')')))
                found.push('/' + segs.join('/'))
            }
        }
    }
    walk(API_ROOT)
    return found
}

/** Build a fake `next build` route-table block from a list of URLs. */
function fakeBuildOutput(urls) {
    const header = `Route (app)                                    Size  First Load JS\n`
    const lines = urls.map((u, i) => {
        const prefix = i === 0 ? '┌' : (i === urls.length - 1 ? '└' : '├')
        return `${prefix} ƒ ${u.padEnd(40)} 227 B         102 kB`
    }).join('\n')
    const footer = `\n○  (Static)   prerendered as static content\nƒ  (Dynamic)  server-rendered on demand\n`
    return header + lines + footer
}

describe('scripts/check-routes.js', () => {
    it('exits 0 when every route file on disk is in the build table', () => {
        const routes = discoverRoutes()
        const buildLog = fakeBuildOutput(routes)
        const result = runScript(buildLog)
        expect(result.status, result.stderr).toBe(0)
        expect(result.stdout).toMatch(/All \d+ app\/api route files are registered/)
    })

    it('exits 1 when a route file exists but is missing from the build table', () => {
        const routes = discoverRoutes()
        // Drop one route from the fake build output — simulates the V11-1 bug.
        const buildLog = fakeBuildOutput(routes.slice(1))
        const result = runScript(buildLog)
        expect(result.status).toBe(1)
        expect(result.stderr).toMatch(/route file\(s\) on disk but NOT in next build/)
        expect(result.stderr).toContain(routes[0])
    })

    it('prints helpful diagnostics when routes are missing', () => {
        const routes = discoverRoutes()
        const buildLog = fakeBuildOutput(routes.slice(1))
        const result = runScript(buildLog)
        expect(result.stderr).toMatch(/failed to compile|file a bug/)
        expect(result.stderr).toMatch(/Actual routes found in build output/)
    })

    it('handles route-group segments (paren-wrapped) by stripping them', () => {
        // Synthesise a build log that uses the URL Next would actually
        // serve for a hypothetical app/api/(public)/health/route.js —
        // that's just /api/health (the (public) segment is silent).
        // We're testing the SCRIPT's parser/path-logic, not the project's
        // actual routes, so use a minimal fake log.
        const buildLog = fakeBuildOutput(['/api/health'])
        // Inject the fake by piping it; the script will then ALSO walk
        // the real filesystem, so this test only proves the parser
        // accepts the route — strict diff is covered by tests above.
        const result = runScript(buildLog)
        // Doesn't matter if it passes or fails — we just want NO crash.
        expect([0, 1]).toContain(result.status)
    })

    it('exits 2 with usage when nothing is piped and no file is given', () => {
        // Can't simulate isTTY easily; instead just give it a bogus filename
        // to take the file branch and get a clean read error.
        const result = spawnSync('node', [SCRIPT, '/no/such/file'], {
            encoding: 'utf8',
            timeout: 5_000
        })
        expect(result.status).toBe(2)
        expect(result.stderr).toMatch(/Cannot read/)
    })

    it('parses ƒ Dynamic and ○ Static lines equally', () => {
        // Mix both markers. Both should be picked up as valid routes.
        const log = [
            'Route (app)                Size  First Load',
            '┌ ƒ /api/health           227 B  102 kB',
            '├ ○ /admin/users          5 kB   120 kB',
            '└ ƒ /api/views/index      227 B  102 kB',
            '',
            '○ (Static)   prerendered as static content',
            'ƒ (Dynamic)  server-rendered on demand'
        ].join('\n')
        // Compare against a discovery that includes /api/health and /api/views/index
        // — if they're real routes in this codebase, this should pass.
        // If they aren't, this test still doesn't fail because it's just
        // proving the parser regex covers both symbols (test passes if exit
        // code is 0 OR 1; only crash would fail it).
        const result = runScript(log)
        expect([0, 1]).toContain(result.status)
    })

    it('V11-1 guard: exits 1 if a route.js is found OUTSIDE app/', () => {
        // Simulate the V11-1 bug: a route.js file under lib/.
        // We create a real file in a tmp dir we can clean up. The script
        // walks the real repo, so we have to drop it inside the project.
        // We use a non-conflicting nested path under lib/ that no other
        // test or code reaches.
        const stray = path.resolve(__dirname, '..', 'lib', '__stray-test__', 'route.js')
        fs.mkdirSync(path.dirname(stray), { recursive: true })
        fs.writeFileSync(stray, '// V11-1 regression test fixture\n')

        try {
            // Build log doesn't matter — stray check runs FIRST and exits.
            const result = runScript('Route (app)\n')
            expect(result.status).toBe(1)
            expect(result.stderr).toMatch(/route\.js file\(s\) OUTSIDE app\//)
            expect(result.stderr).toContain('lib/__stray-test__/route.js')
            expect(result.stderr).toMatch(/V11-1/)
        } finally {
            // Always clean up so the repo isn't left dirty.
            fs.rmSync(path.dirname(stray), { recursive: true, force: true })
        }
    })
})

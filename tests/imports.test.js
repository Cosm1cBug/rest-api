import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Walk every .js/.jsx source file and assert that every `from '@/...'`
 * import resolves to a real file on disk.
 *
 * This catches the exact class of bug V4-1 was: a renamed module that
 * leaves dangling imports. The test runs in <1s, has no external deps,
 * and would have failed CI the moment the typo landed.
 */

const ROOT = path.resolve(process.cwd())
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'tests'])
const SOURCE_EXTS = ['.js', '.jsx']
const RESOLVE_EXTS = ['.js', '.jsx', '/index.js', '/index.jsx']

async function walk(dir, out = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
            if (IGNORE_DIRS.has(e.name)) continue
            await walk(p, out)
        } else if (SOURCE_EXTS.some(ext => e.name.endsWith(ext))) {
            out.push(p)
        }
    }
    return out
}

function extractAliasImports(src) {
    // Match both static imports and dynamic imports.
    //   import X from '@/foo'
    //   import { X } from '@/foo'
    //   import('@/foo')
    //   export { X } from '@/foo'
    const re = /(?:from|import)\s*\(?\s*['"](@\/[^'"]+)['"]/g
    const out = new Set()
    let m
    while ((m = re.exec(src)) !== null) out.add(m[1])
    return [...out]
}

async function resolveAlias(spec) {
    // `@/foo/bar.js` → `<ROOT>/foo/bar.js`
    const rel = spec.replace(/^@\//, '')
    const candidates = [
        path.join(ROOT, rel),
        ...RESOLVE_EXTS.map(ext => path.join(ROOT, rel + ext))
    ]
    for (const c of candidates) {
        try {
            const st = await fs.stat(c)
            if (st.isFile()) return c
        } catch {}
    }
    return null
}

describe('@/ imports', () => {
    it('every alias import resolves to an existing file', async () => {
        const files = await walk(ROOT)
        const broken = []

        for (const file of files) {
            const src = await fs.readFile(file, 'utf8')
            const aliases = extractAliasImports(src)
            for (const a of aliases) {
                const resolved = await resolveAlias(a)
                if (!resolved) {
                    broken.push(`${path.relative(ROOT, file)} -> ${a}`)
                }
            }
        }

        expect(broken, `Broken imports:\n  ${broken.join('\n  ')}`).toEqual([])
    })
})

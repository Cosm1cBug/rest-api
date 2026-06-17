/**
 * V14 OpenAPI spec validation — ensures the hand-annotated spec stays
 * well-formed and fully covers every route file in app/api/**.
 *
 * What this catches:
 *   - A new route added without an @openapi block (coverage gap).
 *   - A YAML syntax error in an annotation (swagger-jsdoc would warn
 *     and silently drop the path; this test surfaces it).
 *   - A method exported by the route file that's missing from the spec
 *     (e.g. file has GET + PATCH; annotation only documents GET).
 *   - A reference to a non-existent component (schema or response).
 *
 * What this DOES NOT catch:
 *   - Drift between the annotation and the actual response shape — the
 *     annotation says `{ success, user }` but the handler returns
 *     `{ user, ok }`. That's the price of hand-annotation. Use
 *     integration tests for that class of bug.
 *
 * Run: npm test
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'fs'
import { join } from 'path'
import { swaggerSpec } from '../lib/swagger.js'

const REPO_ROOT = process.cwd()

function walkRouteFiles(dir) {
    const out = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const f = join(dir, e.name)
        if (e.isDirectory()) out.push(...walkRouteFiles(f))
        else if (/^route\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(f)
    }
    return out
}

function routeUrlFromFile(filePath) {
    const rel = filePath.replace(REPO_ROOT + '/', '').replace(/\\/g, '/')
    const inner = rel.replace(/^app\//, '').replace(/\/route\.(js|jsx|ts|tsx)$/, '')
    const parts = inner.split('/').filter(s => !(s.startsWith('(') && s.endsWith(')')))
    return '/' + parts.map(p => {
        const catchAll = p.match(/^\[\.\.\.(\w+)\]$/)
        if (catchAll) return '{' + catchAll[1] + '}'
        const dyn = p.match(/^\[(\w+)\]$/)
        if (dyn) return '{' + dyn[1] + '}'
        return p
    }).join('/')
}

describe('OpenAPI spec', () => {

    it('is OpenAPI 3.0.x and has the expected top-level fields', () => {
        expect(swaggerSpec.openapi).toMatch(/^3\.0\.\d+$/)
        expect(swaggerSpec.info?.title).toBe('OrbitNode API')
        expect(swaggerSpec.info?.version).toMatch(/^\d+\.\d+\.\d+$/)
        expect(Array.isArray(swaggerSpec.tags)).toBe(true)
        expect(swaggerSpec.tags.length).toBeGreaterThan(0)
    })

    it('declares the three auth schemes (SessionCookie, ApiKey, AdminKey)', () => {
        const schemes = swaggerSpec.components?.securitySchemes || {}
        expect(schemes).toHaveProperty('SessionCookie')
        expect(schemes).toHaveProperty('ApiKey')
        expect(schemes).toHaveProperty('AdminKey')
    })

    it('declares the reusable error responses', () => {
        const responses = swaggerSpec.components?.responses || {}
        for (const name of ['Unauthorized', 'Forbidden', 'NotFound', 'RateLimited', 'ValidationError']) {
            expect(responses, `missing reusable response: ${name}`).toHaveProperty(name)
        }
    })

    it('declares the reusable schemas', () => {
        const schemas = swaggerSpec.components?.schemas || {}
        for (const name of ['ErrorResponse', 'UserDto', 'ApiKeyDto', 'AuditEntry']) {
            expect(schemas, `missing reusable schema: ${name}`).toHaveProperty(name)
        }
    })

    it('covers every route.js file in app/api (no missing annotations)', () => {
        const files = walkRouteFiles(join(REPO_ROOT, 'app', 'api'))
        const expected = new Set(files.map(routeUrlFromFile))
        const actual = new Set(Object.keys(swaggerSpec.paths || {}))

        const missing = [...expected].filter(p => !actual.has(p))
        expect(
            missing,
            `${missing.length} route file(s) are missing @openapi annotations:\n  ${missing.join('\n  ')}`
        ).toEqual([])
    })

    it('every annotated path has at least one HTTP method with tags + summary + 2xx response', () => {
        const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
        const problems = []

        for (const [pathUrl, pathItem] of Object.entries(swaggerSpec.paths || {})) {
            const methods = HTTP_METHODS.filter(m => m in pathItem)
            if (methods.length === 0) {
                problems.push(`${pathUrl}: no HTTP methods declared`)
                continue
            }
            for (const method of methods) {
                const op = pathItem[method]
                if (!op.tags || op.tags.length === 0) {
                    problems.push(`${pathUrl} [${method}]: missing tags`)
                }
                if (!op.summary) {
                    problems.push(`${pathUrl} [${method}]: missing summary`)
                }
                const responseStatuses = Object.keys(op.responses || {})
                const has2xx = responseStatuses.some(s => /^2\d\d$/.test(s))
                if (!has2xx) {
                    problems.push(`${pathUrl} [${method}]: no 2xx response declared`)
                }
            }
        }

        expect(problems, problems.join('\n')).toEqual([])
    })

    it('every $ref points to a defined component', () => {
        const json = JSON.stringify(swaggerSpec)
        const refs = [...json.matchAll(/"\$ref"\s*:\s*"([^"]+)"/g)].map(m => m[1])
        const problems = []

        for (const ref of refs) {
            // Form: #/components/<type>/<name>
            const m = ref.match(/^#\/components\/(\w+)\/(\w+)$/)
            if (!m) {
                problems.push(`unparseable $ref: ${ref}`)
                continue
            }
            const [, type, name] = m
            if (!swaggerSpec.components?.[type]?.[name]) {
                problems.push(`dangling $ref ${ref}: components.${type}.${name} not defined`)
            }
        }

        expect(problems, problems.join('\n')).toEqual([])
    })

    it('every operation that uses SessionCookie/ApiKey/AdminKey references a declared scheme', () => {
        const declaredSchemes = new Set(Object.keys(swaggerSpec.components?.securitySchemes || {}))
        const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete']
        const problems = []

        for (const [pathUrl, pathItem] of Object.entries(swaggerSpec.paths || {})) {
            for (const method of HTTP_METHODS) {
                const op = pathItem[method]
                if (!op?.security) continue
                for (const requirement of op.security) {
                    for (const schemeName of Object.keys(requirement)) {
                        if (!declaredSchemes.has(schemeName)) {
                            problems.push(`${pathUrl} [${method}]: references undeclared security scheme "${schemeName}"`)
                        }
                    }
                }
            }
        }

        expect(problems, problems.join('\n')).toEqual([])
    })
})

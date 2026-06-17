import swaggerJsdoc from 'swagger-jsdoc'

/**
 * OpenAPI 3.0 specification, built at module load by walking
 * `@openapi` JSDoc blocks in every route handler under app/api/**.
 *
 * Why hand-annotated rather than zod-to-openapi
 * ─────────────────────────────────────────────
 * V14 decision: keep OpenAPI as a pure description layer separate from
 * the Zod runtime validators. Pro: spec is the contract you publish to
 * external consumers and is more expressive than Zod (descriptions,
 * examples, reusable responses). Con: shape duplication — when you
 * change a Zod validator you must update the annotation. Drift is caught
 * by tests/openapiSpec.test.js which asserts every route file has at
 * least a summary + tag + a 2xx response.
 *
 * Components
 * ──────────
 *   securitySchemes  — 3 surfaces (SessionCookie, ApiKey, AdminKey)
 *   responses        — 5 reusable error responses
 *   schemas          — 6 reusable DTOs (UserDto, ApiKeyDto, AuditEntry,
 *                      ApiKeyIssueResponse, PaginatedUsers, FeaturesList)
 *
 * Consumed by
 * ───────────
 *   - GET /api/docs                  — returns the spec as JSON
 *                                      (admin-key gated; describes internal
 *                                      surfaces alongside public ones)
 *   - tests/openapiSpec.test.js      — well-formed + complete-coverage check
 *
 * Schema sync
 * ───────────
 * When a route's Zod validator changes (lib/validators/*.js), update the
 * corresponding @openapi block in app/api/.../route.js. The coverage
 * test won't catch a shape drift — that's the price of hand-annotation —
 * but it will catch a missing/empty annotation.
 */
const swaggerConfig = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'OrbitNode API',
            version: '1.0.0',
            description: [
                'Self-hosted, production-grade API platform on Next.js 15.',
                '',
                '## Authentication surfaces',
                '',
                'Three independent auth surfaces; pick based on the endpoint:',
                '',
                '| Scheme        | Header / Cookie                         | Used by                                |',
                '|---------------|----------------------------------------|----------------------------------------|',
                '| SessionCookie | `__Secure-next-auth.session-token`     | `/api/user/*`, `/api/admin/*`, `/api/dashboard/*` |',
                '| ApiKey        | `x-api-key: keyId.secret`              | `/api/github/*`, `/api/uploads`        |',
                '| AdminKey      | `x-admin-key: <key>`                   | `/api/prometheus`, `/api/docs`, optional health detail |',
                '',
                '## Rate limiting',
                '',
                'Most endpoints are limited per-IP via Redis sliding windows. Auth endpoints',
                'also have per-(IP, email) limiters and per-account lockouts. Exceeding any',
                'limit returns `429` with a `Retry-After` header in seconds.',
                '',
                '## Audit + SIEM',
                '',
                'Every admin mutation is recorded in MongoDB (`AuditLog`) and forwarded to',
                'the configured SIEM file when `SIEM_AUDIT_PATH` is set. See `docs/SIEM.md`.',
                '',
                '## Consuming the spec',
                '',
                'Fetch as an admin operator:',
                '',
                '    curl -H "x-admin-key: $ADMIN_KEY" https://your-host/api/docs > openapi.json',
                '',
                'Then import into Postman/Insomnia or feed to `openapi-generator-cli`.'
            ].join('\n'),
            contact: { name: 'COSMICBUG' },
            license: { name: 'Proprietary — see LICENSE in repo root' }
        },
        servers: [
            { url: 'http://localhost:3000', description: 'Local dev' },
            {
                url: 'https://{host}',
                description: 'Production',
                variables: { host: { default: 'your-domain.com' } }
            }
        ],
        tags: [
            { name: 'Public',    description: 'No authentication required.' },
            { name: 'Auth',      description: 'Registration, login, password reset, OAuth.' },
            { name: 'User',      description: 'Authenticated user actions (SessionCookie).' },
            { name: 'Admin',     description: 'Admin role required (SessionCookie + role=admin).' },
            { name: 'Dashboard', description: 'Admin observability data (SessionCookie + role=admin).' },
            { name: 'Scrapers',  description: 'API-key gated demo scrapers.' },
            { name: 'Ops',       description: 'Operator-only via x-admin-key (Prometheus, docs).' }
        ],
        components: {
            securitySchemes: {
                SessionCookie: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: '__Secure-next-auth.session-token',
                    description: 'NextAuth JWT session cookie. Obtained via /api/auth/callback/credentials or any OAuth callback.'
                },
                ApiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'Split-key format `keyId.secret`. Generated at /user/api-keys. Only the bcrypt hash of the secret is stored server-side.'
                },
                AdminKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-admin-key',
                    description: 'Operator key, compared in constant time against the ADMIN_KEY env var. The check fails closed if ADMIN_KEY is unset.'
                }
            },
            responses: {
                Unauthorized: {
                    description: 'Authentication missing or invalid.',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
                },
                Forbidden: {
                    description: 'Authenticated but lacking the required role/scope.',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
                },
                NotFound: {
                    description: 'Resource does not exist (or is not visible to the caller).',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
                },
                RateLimited: {
                    description: 'Too many requests. Try again after Retry-After seconds.',
                    headers: {
                        'Retry-After': {
                            schema: { type: 'integer' },
                            description: 'Seconds until the limit window resets.'
                        }
                    },
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
                },
                ValidationError: {
                    description: 'Request body or query failed Zod validation.',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
                }
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    required: ['success'],
                    properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Human-readable error.' },
                        error: { type: 'string', description: 'Stable machine-readable error code (optional).' }
                    }
                },
                UserDto: {
                    type: 'object',
                    properties: {
                        id:                  { type: 'string' },
                        username:            { type: 'string' },
                        email:               { type: 'string', format: 'email' },
                        role:                { type: 'string', enum: ['basic', 'standard', 'premium', 'admin'] },
                        disabled:            { type: 'boolean' },
                        image:               { type: 'string' },
                        endDate:             { type: 'string', format: 'date-time', nullable: true },
                        failedLoginAttempts: { type: 'integer', minimum: 0 },
                        lockedUntil:         { type: 'string', format: 'date-time', nullable: true },
                        createdAt:           { type: 'string', format: 'date-time' },
                        oauthProviders:      { type: 'array', items: { type: 'string', enum: ['google', 'github'] } },
                        oauthProfile:        { type: 'object', additionalProperties: { type: 'string' } },
                        emailVerifiedAt:     { type: 'string', format: 'date-time', nullable: true },
                        apiKeysActive:       { type: 'integer', minimum: 0, description: 'Count of non-revoked keys.' }
                    }
                },
                ApiKeyDto: {
                    type: 'object',
                    properties: {
                        keyId:      { type: 'string', description: 'Public 16-hex prefix.' },
                        label:      { type: 'string' },
                        scopes:     { type: 'array', items: { type: 'string', enum: ['github', 'uploads'] } },
                        expiresAt:  { type: 'string', format: 'date-time', nullable: true },
                        lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                        revoked:    { type: 'boolean' },
                        createdAt:  { type: 'string', format: 'date-time' }
                    }
                },
                ApiKeyIssueResponse: {
                    type: 'object',
                    properties: {
                        success:  { type: 'boolean', example: true },
                        apiKey:   { type: 'string', description: 'Full `keyId.secret` plaintext. Returned ONCE on issuance — not persisted server-side.' },
                        keyId:    { type: 'string' },
                        key:      { $ref: '#/components/schemas/ApiKeyDto' }
                    }
                },
                AuditEntry: {
                    type: 'object',
                    properties: {
                        _id:         { type: 'string' },
                        actorId:     { type: 'string' },
                        actorEmail:  { type: 'string' },
                        action:      { type: 'string', example: 'user.disable' },
                        targetType:  { type: 'string', example: 'user' },
                        targetId:    { type: 'string', nullable: true },
                        targetLabel: { type: 'string' },
                        before:      { type: 'object', nullable: true, additionalProperties: true, description: 'Sensitive fields are auto-redacted to [REDACTED].' },
                        after:       { type: 'object', nullable: true, additionalProperties: true },
                        ip:          { type: 'string' },
                        userAgent:   { type: 'string' },
                        createdAt:   { type: 'string', format: 'date-time' }
                    }
                },
                PaginatedUsers: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        users:   { type: 'array', items: { $ref: '#/components/schemas/UserDto' } },
                        total:   { type: 'integer' },
                        page:    { type: 'integer' },
                        pages:   { type: 'integer' }
                    }
                },
                PaginatedAuditEntries: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        entries: { type: 'array', items: { $ref: '#/components/schemas/AuditEntry' } },
                        total:   { type: 'integer' },
                        page:    { type: 'integer' },
                        pages:   { type: 'integer' }
                    }
                }
            }
        }
    },
    apis: ['./app/api/**/*.js']
}

export const swaggerSpec = swaggerJsdoc(swaggerConfig)

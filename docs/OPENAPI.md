# OpenAPI 3.0 spec — maintenance contract

V14 landed full hand-annotated coverage of all 38 routes under `app/api/`.
The spec is built at boot by `swagger-jsdoc` walking JSDoc `@openapi`
blocks in each route file, and served (admin-key gated) at:

```
GET /api/docs
Header: x-admin-key: <your ADMIN_KEY>
```

## Adding a new route

When you add a new file under `app/api/.../route.js`, you MUST add an
`@openapi` JSDoc block immediately above each exported HTTP-method
handler. CI will fail the `Vitest` job otherwise — see
`tests/openapiSpec.test.js`'s "covers every route.js file" assertion.

### Template

```js
/**
 * @openapi
 * /api/your/path:
 *   get:
 *     tags: [Public]                           # or Auth / User / Admin / Dashboard / Scrapers / Ops
 *     summary: One-line description (REQUIRED)
 *     description: |
 *       Multi-line markdown description (optional but recommended for
 *       non-obvious endpoints — call out rate limits, side effects,
 *       error semantics).
 *     security:                                # OMIT for public endpoints
 *       - SessionCookie: []                    # OR ApiKey OR AdminKey
 *     parameters:
 *       - in: query                            # or path or header
 *         name: foo
 *         required: true
 *         schema: { type: string }
 *     requestBody:                             # OMIT for GET/DELETE
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field]
 *             properties:
 *               field: { type: string }
 *     responses:
 *       200:                                   # 2xx is REQUIRED
 *         description: ...
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UserDto' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
export async function GET(req) { /* ... */ }
```

### What CI enforces

`tests/openapiSpec.test.js` runs 8 checks:

1. Spec is OpenAPI 3.0.x with `info.title` + `tags`
2. Three security schemes declared (SessionCookie, ApiKey, AdminKey)
3. Five reusable error responses (Unauthorized, Forbidden, NotFound, RateLimited, ValidationError)
4. Four reusable schemas (ErrorResponse, UserDto, ApiKeyDto, AuditEntry)
5. **Every `route.js` file under `app/api/` has at least one path in the spec** ← the coverage assertion
6. Every operation has tags + summary + a 2xx response
7. Every `$ref` points to a defined component (no dangling refs)
8. Every operation's `security.<scheme>` references a declared scheme

If you skip the annotation, check #5 fails with the missing path printed.
If you typo a `$ref`, check #7 fails.

### What CI does NOT enforce

- **Shape drift** between the annotation and the actual response. The
  test can't run the handler and compare; it just validates the spec.
  If you change a response shape, you must update the annotation by hand.
  Integration tests (`tests/integration/*.int.test.js`) catch behavior
  drift; the OpenAPI test catches metadata drift.

## Reusable components (in `lib/swagger.js`)

### Security schemes

| Name          | Type            | Used for |
|---------------|-----------------|----------|
| SessionCookie | cookie          | `/api/user/*`, `/api/admin/*`, `/api/dashboard/*` |
| ApiKey        | header `x-api-key` | `/api/github/*`, `/api/uploads` |
| AdminKey      | header `x-admin-key` | `/api/prometheus`, `/api/docs`, optional health detail |

### Reusable error responses

| Name             | When to use                          |
|------------------|--------------------------------------|
| Unauthorized     | Auth required, none provided/invalid |
| Forbidden        | Authenticated but lacking role       |
| NotFound         | Resource doesn't exist (or hidden)   |
| RateLimited      | 429 from any Redis rate-limit        |
| ValidationError  | Zod rejected request body/query      |

### Reusable schemas

| Name                 | Description |
|----------------------|-------------|
| ErrorResponse        | `{ success: false, message?, error? }` |
| UserDto              | Sanitised User document (no password/keyHash) |
| ApiKeyDto            | Per-key fields (keyId, label, scopes, lastUsedAt, revoked) |
| ApiKeyIssueResponse  | Returned ONCE on key issuance — includes plaintext `apiKey` |
| AuditEntry           | Audit log row with `before`/`after` diffs (sensitive fields redacted) |
| PaginatedUsers       | `{ users[], total, page, pages }` |
| PaginatedAuditEntries| same shape for audit log |

## Consuming the spec

### As JSON
```bash
curl -s -H "x-admin-key: $ADMIN_KEY" https://your-host/api/docs > openapi.json
```

### In Postman / Insomnia
Import the JSON file directly — both tools recognise OpenAPI 3.0.
Each request gets pre-filled headers + body templates.

### As a typed client
```bash
npm install -g @openapitools/openapi-generator-cli
openapi-generator-cli generate -i openapi.json -g typescript-fetch -o ./client
```

### In an API gateway
Kong, AWS API Gateway, Apigee, Tyk, and most others accept OpenAPI 3.0
directly for route definitions, rate limiting, and auth scheme
configuration.

## Why hand-annotated rather than `zod-to-openapi`?

`zod-to-openapi` (or `@asteasolutions/zod-to-openapi`) would let us
generate spec components from the existing Zod validators in
`lib/validators/*.js` — single source of truth. We chose hand annotation
in V14 because:

- The spec is more expressive than Zod (descriptions, examples, reusable
  responses, security schemes) — generating these from Zod would still
  require a per-route metadata layer.
- The Zod schemas describe request VALIDATION; the OpenAPI spec also
  describes RESPONSE shapes and error contracts. Most routes have ~3-5x
  more in the spec than the validator covers.
- Hand annotation makes the spec the published contract independent of
  how internal validation happens to be implemented today.

The tradeoff is shape drift. When you change a Zod validator, you must
update the corresponding `@openapi` block by hand. The test suite
catches missing annotations and dangling refs but not silent drift —
that's caught by `tests/integration/*.int.test.js` when it asserts on
actual API responses.

If shape drift becomes a real maintenance burden later, the migration
path to `zod-to-openapi` is mechanical: extract the request `properties`
blocks from each `@openapi`, replace with `$ref` to the
generated-from-Zod components, keep everything else hand-written.

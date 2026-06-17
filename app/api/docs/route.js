import { swaggerSpec } from '@/lib/swagger.js'
import { checkAdminKey } from '@/lib/auth/adminKey.js'
import { failure } from '@/lib/apiResponse.js'

export const dynamic = 'force-dynamic'

/**
 * @openapi
 * /api/docs:
 *   get:
 *     tags: [Ops]
 *     summary: OpenAPI 3.0 specification (admin-key gated)
 *     description: |
 *       Returns the full machine-readable OpenAPI spec for this deployment,
 *       generated at boot from `@openapi` JSDoc blocks in every route file.
 *       Use it to bootstrap Postman/Insomnia collections, generate typed
 *       clients with `openapi-generator-cli`, or wire into an API gateway.
 *
 *       The endpoint is admin-key gated because the spec describes internal
 *       admin/dashboard surfaces alongside public-facing ones. Publishing
 *       the full spec to anonymous callers would be reconnaissance.
 *     security:
 *       - AdminKey: []
 *     responses:
 *       200:
 *         description: OpenAPI 3.0 JSON document.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: A valid OpenAPI 3.0 document.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export async function GET(req) {
    const denied = checkAdminKey(req)
    if (denied) return failure('Unauthorized.', 401)

    return Response.json(swaggerSpec, {
        headers: {
            // 5 minutes — the spec only changes on deploy, so a small
            // cache window is safe and reduces the load on the
            // build-time swagger-jsdoc walker.
            'Cache-Control': 'private, max-age=300, must-revalidate'
        }
    })
}

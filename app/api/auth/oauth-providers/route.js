/**
 * GET /api/auth/oauth-providers
 *
 * Returns the list of OAuth provider IDs that are configured on this
 * deployment (i.e. have both CLIENT_ID and CLIENT_SECRET env vars set).
 * The login page UI uses this to render only buttons for enabled
 * providers — without it, the UI would have to bake the provider list
 * into the client bundle, which then can't differ between environments.
 *
 * Public endpoint — leaks nothing more than what an OAuth user would see
 * when starting a sign-in flow (the provider buttons exist).
 *
 * Response: { providers: string[] }  e.g. { "providers": ["google", "github"] }
 */

import { NextResponse } from 'next/server'
import { getEnabledOAuthProviderIds } from '@/lib/auth/oauthProviders.js'

export const dynamic = 'force-dynamic'   // never prerender — env vars matter

/**
 * @openapi
 * /api/auth/oauth-providers:
 *   get:
 *     tags: [Auth]
 *     summary: List configured OAuth providers (drives login-page button rendering)
 *     description: |
 *       Returns the provider IDs that have both `<PROVIDER>_CLIENT_ID` and
 *       `<PROVIDER>_CLIENT_SECRET` set on this deployment. The login page UI
 *       uses this so only the buttons for providers that will actually work get rendered.
 *     responses:
 *       200:
 *         description: Provider list (may be empty if none configured).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 providers:
 *                   type: array
 *                   items: { type: string, enum: [google, github] }
 *                   example: [google, github]
 */
export async function GET() {
    return NextResponse.json(
        { providers: getEnabledOAuthProviderIds() },
        {
            // Cache for 60s in CDNs but not on the client (env changes
            // need a server restart anyway, but no point hammering this
            // endpoint on every login page render).
            headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' }
        }
    )
}

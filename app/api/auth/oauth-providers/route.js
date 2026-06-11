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

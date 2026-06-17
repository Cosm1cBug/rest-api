import * as NextAuthModule from 'next-auth'

const NextAuth =
    NextAuthModule.default?.default
    || NextAuthModule.default
    || NextAuthModule
import { authOptions } from '@/lib/auth/authOptions.js'

const handler = NextAuth(authOptions)

/**
 * @openapi
 * /api/auth/{nextauth}:
 *   get:
 *     tags: [Auth]
 *     summary: NextAuth catch-all handler (signin, callback, csrf, session, signout, providers, error)
 *     description: |
 *       Single endpoint that NextAuth routes to its internal handlers based on
 *       the path segments. Common subroutes:
 *
 *         /api/auth/signin                       — sign-in page redirect
 *         /api/auth/signin/<provider>            — OAuth start (google, github, credentials)
 *         /api/auth/callback/<provider>          — OAuth callback
 *         /api/auth/callback/credentials         — credentials POST target
 *         /api/auth/csrf                         — CSRF token for credentials POST
 *         /api/auth/session                      — current session object
 *         /api/auth/signout                      — sign-out (POST)
 *         /api/auth/providers                    — list of all NextAuth-configured providers
 *
 *       For credentials sign-in, see also `/api/auth/oauth-providers` which
 *       returns the OAuth provider IDs the deployment has configured (used by
 *       the login page UI to render only the buttons that will work).
 *     parameters:
 *       - in: path
 *         name: nextauth
 *         required: true
 *         schema:
 *           type: array
 *           items: { type: string }
 *         description: Catch-all path segments routed to NextAuth's internal handlers.
 *     responses:
 *       200: { description: Handler-specific response (JSON or HTML redirect). }
 *       302: { description: Redirect (OAuth flow, sign-in page, etc.). }
 *       400: { description: Bad request (missing CSRF token, etc.). }
 *       401: { description: Authentication failed. }
 *   post:
 *     tags: [Auth]
 *     summary: NextAuth catch-all handler (signin POST, callback POST, signout POST)
 *     description: |
 *       Same handler as GET. Common POST subroutes:
 *
 *         /api/auth/callback/credentials         — credentials sign-in (email + password + csrfToken)
 *         /api/auth/signout                      — sign-out
 *     requestBody:
 *       required: false
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               email:      { type: string, format: email }
 *               password:   { type: string }
 *               csrfToken:  { type: string }
 *               callbackUrl: { type: string }
 *     responses:
 *       200: { description: Successful sign-in/out (JSON when `?json=true`). }
 *       302: { description: Default redirect. }
 *       401: { description: Credentials rejected. }
 */
export { handler as GET, handler as POST }

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import * as GoogleProviderModule from 'next-auth/providers/google'
import * as GitHubProviderModule from 'next-auth/providers/github'

// NextAuth's provider modules have the same CJS-interop quirk as
// CredentialsProvider — see authOptions.js for the .default.default chain.
const GoogleProvider =
    GoogleProviderModule.default?.default
    || GoogleProviderModule.default
    || GoogleProviderModule

const GitHubProvider =
    GitHubProviderModule.default?.default
    || GitHubProviderModule.default
    || GitHubProviderModule

/**
 * Build the OAuth/OIDC provider array. Call once at module load from
 * authOptions.js. Returns [] if no providers are configured (the
 * email-OTP CredentialsProvider remains the only sign-in path).
 */
export function buildOAuthProviders() {
    const providers = []

    // ─── Google (OIDC) ───────────────────────────────────────────────
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        providers.push(GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Default scope already includes openid + email + profile.
            // We DON'T request additional scopes (calendar, drive, etc.) —
            // principle of least privilege.
            authorization: {
                params: {
                    // prompt=consent forces Google to re-show the consent
                    // screen on every sign-in. Recommended for B2B / audit
                    // trail clarity; comment out for smoother UX if your
                    // threat model allows silent re-auth.
                    prompt: 'consent',
                    access_type: 'offline',
                    response_type: 'code'
                }
            }
        }))
    }

    // ─── GitHub (OAuth 2.0) ──────────────────────────────────────────
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
        providers.push(GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            // Default scope is 'read:user user:email' — covers what we
            // need (display name + verified email) without granting any
            // repo or admin access. Do not extend without a strong reason.
        }))
    }

    return providers
}

/**
 * Returns the list of configured OAuth provider IDs (e.g. ['google', 'github']).
 * Used by the login page UI to render only buttons for providers that are
 * actually configured.
 */
export function getEnabledOAuthProviderIds() {
    const ids = []
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ids.push('google')
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) ids.push('github')
    return ids
}

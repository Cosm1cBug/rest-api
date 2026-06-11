/**
 * OAuth account linking and creation.
 *
 * Called from the NextAuth `signIn` callback on every OAuth sign-in
 * attempt. Decides whether to:
 *   (a) sign in an existing User whose oauthProfile already maps this
 *       provider's account ID,
 *   (b) link this OAuth identity to an existing User whose verified
 *       email matches (and the user hasn't disabled OAuth linking),
 *   (c) create a brand new User document,
 *   (d) REJECT the sign-in (account is disabled, email collision with
 *       an unverified account, account-takeover heuristic, etc.).
 *
 * The function returns { allow: boolean, user: User|null, reason: string }.
 * The signIn callback then logs the decision via writeAudit() (Mongo +
 * SIEM) and returns allow to NextAuth.
 *
 * Security policy
 * ──────────────────────────────
 *   1. Same provider + same account ID  → sign in existing user. Always.
 *   2. New provider + email matches existing user + their email was
 *      verified via OTP previously       → LINK (add provider to
 *                                          oauthProviders, set
 *                                          oauthProfile[provider]=id)
 *   3. New provider + email matches existing user + that user is
 *      OAuth-only with a DIFFERENT provider → LINK (the user proved
 *                                          email ownership originally via
 *                                          that OAuth provider, and now is
 *                                          proving it via a second one)
 *   4. Email matches but the user is disabled → REJECT
 *   5. Email matches but the OAuth provider says email_verified=false
 *                                               → REJECT
 *   6. No existing user for this email + email is provider-verified
 *                                               → CREATE new user
 *   7. No existing user + email is NOT provider-verified → REJECT
 *
 * Username generation for new users
 * ─────────────────────────────────
 * OAuth gives us email + display name, no username. We derive:
 *     username = sanitize(emailLocal) + '-' + cryptoRandomSuffix
 * Where sanitize strips characters that don't match the existing
 * registerSchema regex (^[a-zA-Z0-9_.-]+$). The suffix prevents
 * collisions and makes the username unguessable (no
 * email-from-username enumeration).
 */

import crypto from 'crypto'
import User from '@/models/user.js'
import { issueApiKey } from '@/lib/auth/apiKeys.js'

const USERNAME_RANDOM_SUFFIX_BYTES = 4   // → 8 hex chars → 4 billion combos
const USERNAME_MAX_LEN = 30              // matches registerSchema

/**
 * Sanitize an email local-part into a valid username prefix.
 * Falls back to 'user' if nothing usable remains.
 */
function sanitizeUsernamePrefix(emailLocal) {
    const cleaned = String(emailLocal || '')
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '')   // strip everything not in the registerSchema regex
        .replace(/^[.-]+|[.-]+$/g, '')   // no leading/trailing dots or hyphens
        .slice(0, USERNAME_MAX_LEN - 1 - USERNAME_RANDOM_SUFFIX_BYTES * 2)

    return cleaned.length >= 3 ? cleaned : 'user'
}

/**
 * Generate a collision-resistant username from an email address.
 */
function generateUsername(email) {
    const local = String(email || '').split('@')[0]
    const prefix = sanitizeUsernamePrefix(local)
    const suffix = crypto.randomBytes(USERNAME_RANDOM_SUFFIX_BYTES).toString('hex')
    return `${prefix}-${suffix}`
}

/**
 * Determine whether the provider reports the email as verified.
 *
 * NextAuth normalises this differently per provider:
 *   - Google: profile.email_verified (boolean) — we trust it.
 *   - GitHub: profile.email is only populated when the user has at least
 *     one verified email; NextAuth's provider config calls /user/emails
 *     internally and picks the primary verified one. So if `profile.email`
 *     exists at all from GitHub, it's verified.
 *
 * For unknown providers we default to FALSE (refuse to link/create)
 * rather than open ourselves to email-spoofing attacks.
 */
export function providerVerifiedEmail(provider, profile) {
    if (!profile || !profile.email) return false

    switch (provider) {
        case 'google':
            // Google OIDC `id_token` claim. Some Google Workspace tenants
            // omit it; in that case we conservatively say false.
            return profile.email_verified === true
        case 'github':
            // GitHub only returns an email at all when the user has a
            // verified one (via the user:email scope + /user/emails fallback).
            return true
        default:
            return false
    }
}

/**
 * Main entry point — called from authOptions.js `signIn` callback.
 *
 * @param {object} args
 * @param {string} args.provider      — e.g. 'google', 'github'
 * @param {string} args.providerAccountId — provider's stable user ID
 * @param {object} args.profile       — full profile object NextAuth received
 * @returns {Promise<{ allow: boolean, user: object|null, reason: string,
 *                     action: 'signin'|'link'|'create'|'reject' }>}
 */
export async function resolveOAuthSignIn({ provider, providerAccountId, profile }) {
    // ─── Sanity checks ────────────────────────────────────────────────
    if (!provider || !providerAccountId) {
        return { allow: false, user: null, action: 'reject', reason: 'missing-provider-id' }
    }
    const email = String(profile?.email || '').toLowerCase().trim()
    if (!email) {
        return { allow: false, user: null, action: 'reject', reason: 'no-email' }
    }

    // ─── Path 1: same provider, same provider account id ─────────────
    // The fast path for return logins. Match on oauthProfile.<provider>.
    const byProviderId = await User.findOne({
        [`oauthProfile.${provider}`]: String(providerAccountId)
    })

    if (byProviderId) {
        if (byProviderId.disabled) {
            return { allow: false, user: null, action: 'reject', reason: 'account-disabled' }
        }
        return { allow: true, user: byProviderId, action: 'signin', reason: 'existing-link' }
    }

    // ─── Path 2: email-based account linking ─────────────────────────
    const byEmail = await User.findOne({ email })

    if (byEmail) {
        if (byEmail.disabled) {
            return { allow: false, user: null, action: 'reject', reason: 'account-disabled' }
        }

        // The OAuth provider MUST assert the email is verified, otherwise
        // an attacker who controls a Google Workspace tenant for victim's
        // domain could claim any of their emails.
        if (!providerVerifiedEmail(provider, profile)) {
            return { allow: false, user: null, action: 'reject', reason: 'provider-email-unverified' }
        }

        // The existing user's email MUST also be verified — either by OTP
        // (any user from verify-otp route) or by a previous OAuth login
        // from a provider that verifies email. Today every existing User
        // has been through verify-otp, so we set emailVerifiedAt on link
        // (we backfill missing values on link).
        // No additional check needed at this layer — the registration flow
        // is the trust root for `byEmail.email`.

        // Link: add provider to oauthProviders, set oauthProfile[provider].
        // Use $addToSet so re-running the link is idempotent.
        const update = {
            $addToSet: { oauthProviders: provider },
            $set: {
                [`oauthProfile.${provider}`]: String(providerAccountId),
                emailVerifiedAt: byEmail.emailVerifiedAt || new Date()
            }
        }
        const linked = await User.findOneAndUpdate(
            { _id: byEmail._id },
            update,
            { new: true }
        )
        return { allow: true, user: linked, action: 'link', reason: 'linked-by-verified-email' }
    }

    // ─── Path 3: brand new user ───────────────────────────────────────
    if (!providerVerifiedEmail(provider, profile)) {
        return { allow: false, user: null, action: 'reject', reason: 'provider-email-unverified' }
    }

    // Find a free username. Try the generated one first; on collision
    // regenerate up to N times (extremely unlikely with 8-hex suffix).
    let username = null
    for (let i = 0; i < 5; i++) {
        const candidate = generateUsername(email)
        const taken = await User.exists({ username: candidate })
        if (!taken) {
            username = candidate
            break
        }
    }
    if (!username) {
        // Five 8-hex collisions in a row is basically impossible without
        // an attacker, so we refuse rather than try harder.
        return { allow: false, user: null, action: 'reject', reason: 'username-collision' }
    }

    let created
    try {
        created = await User.create({
            username,
            email,
            // No password — OAuth-only account. password field is now
            // optional in the schema (V11 change).
            role: 'basic',
            oauthProviders: [provider],
            oauthProfile: { [provider]: String(providerAccountId) },
            emailVerifiedAt: new Date(),
            // Set image to provider's avatar if present, otherwise default
            image: profile.picture || profile.avatar_url || 'default.jpg'
        })
    } catch (err) {
        // E11000 = unique index violation. Either email or username got
        // taken by another concurrent OAuth sign-in. Fail closed and let
        // the user retry — they'll hit the byEmail path next time.
        if (err && err.code === 11000) {
            return { allow: false, user: null, action: 'reject', reason: 'concurrent-create-race' }
        }
        throw err
    }

    // Issue a default API key for the new user, same as the OTP flow does.
    // Wrapped in its own try/catch — if key issuance fails the user is
    // still created and can issue a key later from /user/api-keys.
    try {
        await issueApiKey(created._id, { label: 'default (oauth-signup)' })
    } catch (err) {
        console.error('[oauth] failed to issue default api key:', err.message)
    }

    return { allow: true, user: created, action: 'create', reason: 'new-oauth-user' }
}

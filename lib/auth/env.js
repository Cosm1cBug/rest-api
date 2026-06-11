/**
 * Fail-fast environment validation.
 *
 * Run at module load (imported from server.js / next instrumentation /
 * any long-lived entrypoint). If a required secret is missing or weak,
 * the process exits immediately rather than starting in a half-broken,
 * silently-insecure state.
 */

const MIN_SECRET_LEN = 32

function isWeak(name) {
    const v = process.env[name]
    return !v || v.length < MIN_SECRET_LEN
}

/**
 * OAuth provider env-var pair validation.
 *
 * For each OAuth provider, either BOTH the client id and client secret
 * must be set, or NEITHER must be. Half-configured = fail closed.
 *
 * We DON'T enforce a minimum length on these — they come from external
 * issuers (Google Cloud Console, GitHub Developer Settings) and we have
 * no control over their entropy. Trust the issuer's format.
 */
const OAUTH_PROVIDER_ENV_PAIRS = [
    { name: 'Google', idVar: 'GOOGLE_CLIENT_ID',  secretVar: 'GOOGLE_CLIENT_SECRET' },
    { name: 'GitHub', idVar: 'GITHUB_CLIENT_ID',  secretVar: 'GITHUB_CLIENT_SECRET' }
]

export function assertSecrets({ inProduction = process.env.NODE_ENV === 'production' } = {}) {

    const required = ['NEXTAUTH_SECRET', 'JWT_SECRET']
    const productionRequired = ['ADMIN_KEY', 'ALLOWED_ORIGIN']

    const problems = []

    for (const name of required) {
        if (isWeak(name)) {
            problems.push(`${name} must be set to at least ${MIN_SECRET_LEN} characters`)
        }
    }

    if (inProduction) {
        for (const name of productionRequired) {
            if (!process.env[name]) {
                problems.push(`${name} must be set in production`)
            }
        }
        if (process.env.ADMIN_KEY && process.env.ADMIN_KEY.length < MIN_SECRET_LEN) {
            problems.push(`ADMIN_KEY must be at least ${MIN_SECRET_LEN} characters in production`)
        }
    }

    // OAuth pair check (runs in dev and prod; partial config is
    // never valid). Skip cleanly if neither half is set (= provider disabled).
    for (const { name, idVar, secretVar } of OAUTH_PROVIDER_ENV_PAIRS) {
        const hasId = !!process.env[idVar]
        const hasSecret = !!process.env[secretVar]
        if (hasId && !hasSecret) {
            problems.push(`${idVar} is set but ${secretVar} is missing. Either set both to enable ${name} sign-in, or unset both to disable it.`)
        }
        if (!hasId && hasSecret) {
            problems.push(`${secretVar} is set but ${idVar} is missing. Either set both to enable ${name} sign-in, or unset both to disable it.`)
        }
    }

    if (problems.length > 0) {
        for (const p of problems) console.error('[env]', p)
        throw new Error('Refusing to start: insecure environment')
    }
}

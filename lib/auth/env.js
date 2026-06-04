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

    if (problems.length > 0) {
        for (const p of problems) console.error('[env]', p)
        throw new Error('Refusing to start: insecure environment')
    }
}

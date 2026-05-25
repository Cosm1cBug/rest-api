/**
 * Next.js instrumentation hook.
 *
 * Next.js calls `register()` exactly once during server startup,
 * BEFORE the first request is served, on both `next dev` and
 * `next start`. This is the supported place to run boot-time checks
 * and global setup.
 *
 * Why this file exists:
 *   The previous design put boot-time guards in `server.js`, but
 *   `next start` does NOT execute `server.js` — it only runs if you
 *   wire a custom Node server, which this project doesn't. So
 *   `assertSecrets()` never ran in production, defeating its purpose.
 *
 *   Putting the call here makes the "refuses to start with weak
 *   secrets" guarantee actually hold.
 *
 * Performance note:
 *   `register()` runs in BOTH the Node.js runtime and the Edge runtime.
 *   `process.env` and the `assertSecrets` import are safe in both,
 *   but we still gate on NEXT_RUNTIME to avoid double-executing.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        // Edge runtime doesn't run our long-lived process; skip the
        // boot-time checks there. They run in the Node.js runtime once.
        return
    }

    // Dynamic import so the module is only loaded in the Node runtime.
    const { assertSecrets } = await import('./lib/auth/env.js')

    // Throws (and crashes the server) if any required secret is missing
    // or weaker than the policy in lib/auth/env.js. Crashing here is
    // the desired behaviour — fail fast and loud rather than start in
    // a silently insecure state.
    assertSecrets()
}

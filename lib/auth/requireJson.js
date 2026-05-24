/**
 * Reject requests whose Content-Type is not application/json.
 *
 * Why: a request without a JSON content-type is almost certainly either
 *   (a) a misconfigured client, or
 *   (b) a CSRF probe trying to slip in via a form submission (forms
 *       cannot set arbitrary Content-Type headers, so requiring JSON
 *       acts as a lightweight CSRF mitigation on top of SameSite cookies).
 *
 * Returns a Response on rejection, or null on acceptance.
 */
export function requireJson(req) {
    const ct = (req.headers.get('content-type') || '').toLowerCase()
    if (!ct.startsWith('application/json')) {
        return Response.json(
            { success: false, message: 'Content-Type must be application/json' },
            { status: 415 }
        )
    }
    return null
}

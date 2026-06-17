/**
 * Request body size guard.
 *
 * Next.js App Router doesn't apply the pages-router `bodyParser.sizeLimit`
 * config to route handlers. A JSON body of any size will be parsed by
 * req.json() before Zod sees it, so an attacker can force the server to
 * deserialize multi-megabyte payloads for endpoints that only ever
 * expect a few hundred bytes.
 *
 * This helper reads Content-Length and returns a 413 Payload Too Large
 * response if it exceeds the per-route limit. Place it FIRST in the
 * handler, before req.json().
 *
 * Why Content-Length and not piping the body
 * ───────────────────────────────────────────
 * Content-Length is set by every standards-compliant client. A request
 * without Content-Length (chunked transfer) gets the configurable
 * `failOpen` treatment: by default we accept it (chunked is legitimate
 * for legacy clients); set failOpen=false to reject.
 *
 * Tuning per route
 * ────────────────
 * Pick a limit that's the smallest power-of-two larger than the
 * realistic max payload. The Zod validator's field-length sum + ~25%
 * overhead for JSON noise is a good rule of thumb.
 *
 *   - auth flows: 1 KB
 *   - user profile / api-key mgmt: 4 KB
 *   - admin user patch: 4 KB
 *   - generic catch: 16 KB
 *
 * Returns null if OK to proceed, or a Response if the request should
 * be rejected.
 */

const DEFAULT_LIMIT_BYTES = 16 * 1024   // 16 KB

export function checkMaxBodySize(req, { limitBytes = DEFAULT_LIMIT_BYTES, failOpen = true } = {}) {
    const header = req.headers.get('content-length')

    if (header === null || header === '') {
        // No Content-Length header — could be chunked or missing.
        // failOpen=true (default) lets it through; downstream Zod will
        // still bound the parsed values per-field. failOpen=false is
        // strict-mode for endpoints that should NEVER see chunked.
        if (failOpen) return null
        return Response.json(
            { success: false, message: 'Content-Length header required.' },
            { status: 411 }
        )
    }

    const len = Number.parseInt(header, 10)
    if (!Number.isFinite(len) || len < 0) {
        return Response.json(
            { success: false, message: 'Invalid Content-Length.' },
            { status: 400 }
        )
    }

    if (len > limitBytes) {
        return Response.json(
            {
                success: false,
                message: `Request body too large (max ${limitBytes} bytes).`
            },
            { status: 413 }
        )
    }

    return null
}

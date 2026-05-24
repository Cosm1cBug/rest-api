import ipaddr from 'ipaddr.js'

/**
 * Extract a usable client IP from a request, with anti-spoofing rules.
 *
 * The X-Forwarded-For header is trivially forgeable when the request did
 * NOT actually go through a trusted reverse proxy. We therefore only
 * accept XFF when one of these is true:
 *
 *   - `TRUSTED_PROXIES` env var is set (comma-separated list). Production
 *     deployments should set this to the IP(s) of their LB / CDN.
 *   - Or the request reached us via a Next.js platform that has already
 *     vetted the chain (Vercel/Netlify/CloudFront, etc.) — these set
 *     `X-Real-IP` themselves; we trust that header if present.
 *
 * When no trusted source is available we fall back to a per-request
 * placeholder so the rate-limit bucket is NOT a single shared "unknown"
 * (which would let one attacker exhaust the limit for every honest user).
 *
 * @param {Request | { headers: Headers, ip?: string }} req
 * @returns {string}
 */
export function clientIp(req) {
    const headers = req.headers

    const trustProxies = (process.env.TRUSTED_PROXIES || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

    const xRealIp = headers.get?.('x-real-ip')
    if (xRealIp && ipaddr.isValid(xRealIp)) {
        return xRealIp
    }

    if (trustProxies.length > 0) {
        const xff = headers.get?.('x-forwarded-for') || ''
        // Take the LEFT-most entry — that is the original client per RFC 7239.
        // Right-most entries are appended by intermediaries and are trustable;
        // left-most is what the client claimed.
        const first = xff.split(',')[0]?.trim()
        if (first && ipaddr.isValid(first)) {
            return first
        }
    }

    // No trustworthy IP. Return a per-request unique-ish placeholder so
    // we do NOT funnel every anonymous request into one shared bucket.
    // Using the user-agent as a coarse partition is better than "unknown".
    const ua = headers.get?.('user-agent') || 'na'
    return 'anon:' + Buffer.from(ua).toString('base64').slice(0, 24)
}

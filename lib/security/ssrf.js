import dns from 'dns/promises'
import http from 'http'
import https from 'https'
import ipaddr from 'ipaddr.js'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const DEFAULT_ALLOWED_PORTS = new Set([80, 443])
const SAFE_IPV4_RANGES = new Set(['unicast'])
const SAFE_IPV6_RANGES = new Set(['unicast'])

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'ip6-localhost',
    'ip6-loopback',
    'metadata.google.internal',
    'metadata',
    'instance-data',
    'instance-data.ec2.internal'
])

function assertPublicIp(address) {
    let parsed
    try {
        parsed = ipaddr.parse(address)
    } catch {
        throw new Error('Unparseable IP address: ' + address)
    }

    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
        parsed = parsed.toIPv4Address()
    }

    const range = parsed.range()
    const allowed = parsed.kind() === 'ipv4' ? SAFE_IPV4_RANGES : SAFE_IPV6_RANGES

    if (!allowed.has(range)) {
        throw new Error(`Blocked address range "${range}" for ${address}`)
    }
}

/**
 * Validate a user-supplied URL string and return a structured, vetted
 * description that safeFetch() can use without re-resolving DNS.
 *
 * @param {string} target
 * @param {{ allowedPorts?: number[] }} [opts]
 * @returns {Promise<{ url: URL, addresses: string[], port: number }>}
 */
export async function validateUrl(target, opts = {}) {

    if (typeof target !== 'string' || target.length === 0 || target.length > 2048) {
        throw new Error('Invalid URL')
    }

    let parsed
    try {
        parsed = new URL(target)
    } catch {
        throw new Error('Invalid URL')
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        throw new Error('Blocked protocol: ' + parsed.protocol)
    }

    // No credentials in URL — common SSRF carrier.
    if (parsed.username || parsed.password) {
        throw new Error('Credentials in URL are not allowed')
    }

    const allowedPorts = opts.allowedPorts
        ? new Set(opts.allowedPorts)
        : DEFAULT_ALLOWED_PORTS

    const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80)
    if (!allowedPorts.has(port)) {
        throw new Error('Blocked port: ' + port)
    }

    // URL strips IPv6 brackets in `hostname`. Lowercase for comparison.
    const hostname = parsed.hostname.toLowerCase()
    if (BLOCKED_HOSTNAMES.has(hostname)) {
        throw new Error('Blocked hostname: ' + hostname)
    }

    // Internal-zone suffixes that DNS might still resolve in some networks.
    if (hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.localhost')) {
        throw new Error('Blocked internal domain: ' + hostname)
    }

    // If the host is already a literal IP, validate it directly (no DNS).
    let addresses
    if (ipaddr.isValid(hostname)) {
        assertPublicIp(hostname)
        addresses = [hostname]
    } else {
        // Look up BOTH families and require ALL records to be public.
        // Mixed result (e.g. AAAA -> private, A -> public) must fail closed.
        const records = await dns.lookup(hostname, { all: true, verbatim: true })

        if (!records || records.length === 0) {
            throw new Error('DNS lookup returned no records for ' + hostname)
        }

        for (const r of records) {
            assertPublicIp(r.address)
        }

        addresses = records.map(r => r.address)
    }

    return { url: parsed, addresses, port }
}

/**
 * Fetch a URL with SSRF, redirect, size, and timeout protections.
 *
 * Returns a Buffer of the response body. Throws on any safety violation.
 *
 * @param {string} target
 * @param {{
 *   maxBytes?: number,
 *   timeoutMs?: number,
 *   followRedirects?: boolean,
 *   maxRedirects?: number,
 *   headers?: Record<string,string>,
 *   allowedPorts?: number[]
 * }} [opts]
 * @returns {Promise<{ status: number, headers: Record<string,string>, body: Buffer, finalUrl: string }>}
 */
export async function safeFetch(target, opts = {}) {
    const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024   // 10 MiB
    const timeoutMs = opts.timeoutMs ?? 10_000
    const followRedirects = Boolean(opts.followRedirects)
    const maxRedirects = opts.maxRedirects ?? 3

    let currentTarget = target
    let hopsLeft = followRedirects ? maxRedirects : 0

    while (true) {
        const { url, addresses, port } = await validateUrl(currentTarget, {
            allowedPorts: opts.allowedPorts
        })

        const family = ipaddr.parse(addresses[0]).kind() === 'ipv6' ? 6 : 4
        const agentLib = url.protocol === 'https:' ? https : http

        const reqOpts = {
            method: 'GET',
            host: addresses[0],                              // connect to resolved IP
            port,
            path: url.pathname + url.search,
            family,
            headers: {
                Host: url.host,                              // preserve vhost
                'User-Agent': 'Mozilla/5.0',
                Accept: '*/*',
                ...opts.headers
            },
            // For HTTPS, SNI/cert validation must use the original hostname.
            servername: url.hostname,
            timeout: timeoutMs
        }

        const result = await new Promise((resolve, reject) => {
            const req = agentLib.request(reqOpts, (res) => {

                // Redirect handling
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    res.resume()  // drain
                    if (!followRedirects || hopsLeft <= 0) {
                        return reject(new Error('Redirect not allowed (status ' + res.statusCode + ')'))
                    }
                    const next = res.headers.location
                    if (!next) {
                        return reject(new Error('Redirect without Location header'))
                    }
                    // Resolve relative redirects against the current URL.
                    const nextUrl = new URL(next, url).toString()
                    return resolve({ __redirect: nextUrl })
                }

                // Enforce Content-Length if provided.
                const declared = Number(res.headers['content-length'])
                if (Number.isFinite(declared) && declared > maxBytes) {
                    res.destroy()
                    return reject(new Error('Response exceeds size cap'))
                }

                const chunks = []
                let received = 0

                res.on('data', (chunk) => {
                    received += chunk.length
                    if (received > maxBytes) {
                        res.destroy()
                        reject(new Error('Response exceeds size cap'))
                        return
                    }
                    chunks.push(chunk)
                })

                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                        finalUrl: url.toString()
                    })
                })

                res.on('error', reject)
            })

            req.on('timeout', () => {
                req.destroy(new Error('Request timeout'))
            })
            req.on('error', reject)
            req.end()
        })

        if (result.__redirect) {
            hopsLeft -= 1
            currentTarget = result.__redirect
            continue
        }

        return result
    }
}

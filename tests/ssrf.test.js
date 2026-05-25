import { describe, it, expect } from 'vitest'
import { validateUrl } from '../lib/security/ssrf.js'

/**
 * SSRF defence regression tests.
 *
 * Each `expect(...).rejects` corresponds to a bypass we hardened against
 * in V1-#10. If a future refactor reintroduces any of these, this file
 * fails before review.
 *
 * Note: `validateUrl` performs DNS lookups for non-literal hostnames.
 * To keep these tests hermetic we only feed literal IPs / known
 * always-resolvable public hostnames, and we never reach the network.
 * The IP-literal cases short-circuit before DNS.
 */

describe('SSRF validateUrl — should REJECT', () => {
    const blocked = [
        // Loopback (every notation we could think of)
        ['http://127.0.0.1', 'dotted loopback'],
        ['http://127.1', 'short-form loopback'],
        ['http://[::1]', 'IPv6 loopback'],
        ['http://[::ffff:127.0.0.1]', 'IPv4-mapped IPv6 loopback'],

        // Private RFC1918
        ['http://10.0.0.1', '10/8'],
        ['http://192.168.0.1', '192.168/16'],
        ['http://172.16.0.1', '172.16/12'],

        // Cloud metadata
        ['http://169.254.169.254', 'AWS/GCP/Azure metadata IP (link-local)'],

        // Internal domain suffixes (no DNS resolution required for these)
        ['http://metadata.google.internal', 'GCP metadata DNS name'],
        ['http://localhost', 'localhost hostname blocklist'],

        // Wrong scheme
        ['file:///etc/passwd', 'file scheme'],
        ['gopher://example.com/x', 'gopher scheme'],
        ['ftp://example.com', 'ftp scheme'],

        // Wrong port (default allow-list = 80, 443)
        ['http://example.com:25', 'SMTP port'],
        ['http://example.com:6379', 'Redis port'],
        ['http://example.com:11211', 'Memcached port'],

        // URL-embedded credentials
        ['http://user:pass@example.com', 'credentials in URL'],

        // Garbage
        ['not-a-url', 'malformed'],
        ['', 'empty string']
    ]

    for (const [url, label] of blocked) {
        it(`rejects ${label}: ${url}`, async () => {
            await expect(validateUrl(url)).rejects.toThrow()
        })
    }
})

describe('SSRF validateUrl — should ACCEPT', () => {
    it('accepts a literal public IPv4 on port 443 (https)', async () => {
        // 8.8.8.8 (Google DNS) — public unicast, accepted by literal-IP fast path.
        const r = await validateUrl('https://8.8.8.8/')
        expect(r.url.protocol).toBe('https:')
        expect(r.addresses).toEqual(['8.8.8.8'])
    })
})

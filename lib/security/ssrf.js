import dns from 'dns/promises'
import ipaddr from 'ipaddr.js'

const blockedRanges = [
    ['127.0.0.0', 8],
    ['10.0.0.0', 8],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['169.254.0.0', 16]
]

const blockedHosts = [
    'localhost',
    '0.0.0.0'
]

export async function validateUrl(target) {

    let parsed
    try {
        parsed = new URL(target)
    } catch {
        throw new Error('Invalid URL')
    }
     
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid Protocol')
    }
    const hostname = parsed.hostname

    if (blockedHosts.includes(hostname)) {
        throw new Error('Blocked Hostname')
    }

    if (/^\d+$/.test(hostname)) {
        throw new Error('Numeric IP blocked')
    }

    if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')) {
        throw new Error('Blocked Private IPV6 Address')
    }

    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        throw new Error('Blocked internal domain')
    }

    const result = await dns.lookup(hostname)

    if (result.family !== 4 && result.family !== 6) {
        throw new Error('Unknown IP family')
    }

    const addr = ipaddr.parse(result.address)

    for (const [range, bits] of blockedRanges) {
        if (addr.match(ipaddr.parse(range), bits)) {
            throw new Error('Private IP blocked.')
        }
    }
    return true
}
import dns from 'dns/promises'
import ipaddr from 'ipaddr.js'

const blockedRanges = [
    ['127.0.0.0', 8],
    ['10.0.0.0', 8],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16]
]

export async function validateUrl(target) {
    const parsed = new URL(target)

    const result = await dns.lookup(parsed.hostname)

    const addr = ipaddr.parse(result.address)

    for (const [range, bits] of blockedRanges) {
        if (addr.match(ipaddr.parse(range), bits)) {
            throw new Error('Private IP blocked.')
        }
    }
    return true
}
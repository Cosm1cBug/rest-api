const suspiciousIPs = new Map()

export function detectAbuse(ip) {

    const now = Date.now()

    if (!suspiciousIPs.has(ip)) {
        suspiciousIPs.set(ip, [])
    }
    const requests = suspiciousIPs.get(ip)
    requests.push(now)
    const recent = requests.filter( t => now - t < 60000 )
    suspiciousIPs.set( ip, recent )
    return recent.length > 100
}
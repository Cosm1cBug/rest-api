const ipStats = {}

export function trackIP(ip, endpoint) {

    if (!ipStats[ip]) {
        ipStats[ip] = {
            requests: 0,
            endpoints: {},
            firstSeen: Date.now(),
            lastSeen: Date.now()
        }
    }

    ipStats[ip].requests++

    ipStats[ip].lastSeen = Date.now()

    ipStats[ip].endpoints[endpoint] = (ipStats[ip].endpoints[endpoint] || 0) + 1
}

export function getTopIPs() {
    return Object.entries(ipStats).sort((a, b) => b[1].requests - a[1].requests).slice(0, 20)
}
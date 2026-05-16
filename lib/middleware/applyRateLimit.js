export async function applyRateLimit(ip) {
    try {
        await rateLimiter.consume(ip)
        return true
    } catch {
        return false
    }
}
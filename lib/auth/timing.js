/**
 * Sleep for a random duration drawn uniformly from [minMs, maxMs].
 *
 * Used to obscure the timing difference between code paths that perform
 * a real I/O operation (e.g. sending an email) and code paths that
 * short-circuit (e.g. silently dropping a request because the address
 * is already registered). It is NOT a substitute for designing endpoints
 * to be enumeration-resistant in the first place, but it removes the
 * most obvious timing tell from a remote attacker's perspective.
 *
 * Range defaults are tuned to be in the same order of magnitude as a
 * typical Gmail SMTP send (a few hundred ms to ~1.5s).
 *
 * @param {number} [minMs=300]
 * @param {number} [maxMs=1200]
 */
export function jitterDelay(minMs = 300, maxMs = 1200) {
    const span = Math.max(0, maxMs - minMs)
    const ms = minMs + Math.floor(Math.random() * span)
    return new Promise(resolve => setTimeout(resolve, ms))
}

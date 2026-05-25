import { RateLimiterRedis } from 'rate-limiter-flexible'
import { redis } from '@/lib/redis.js'

/**
 * Per-IP send-OTP limiter.
 *
 * Why this exists:
 *   send-otp/route.js already has a per-email limiter (3 sends per
 *   email per 10 min). That defeats targeted email-spam against ONE
 *   address but does NOT bound an attacker who rotates through a list
 *   of 10k addresses from one host — each new email is a fresh bucket,
 *   so the per-email limiter doesn't trip.
 *
 *   This per-IP limiter caps the total send-OTP volume from any single
 *   source, protecting your SMTP quota and your domain's deliverability
 *   reputation (Gmail / Yahoo / Outlook spam classifiers).
 *
 * Tuning:
 *   20 sends per IP per hour is generous for a legit user (re-register,
 *   typo-then-correct, etc.) and tight enough that an attacker would
 *   need ~500 IPs to issue 10k requests in an hour — at which point
 *   the SMTP cost is bounded.
 */
const perIpLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'sendotp-ip',
    points: 20,             // 20 sends
    duration: 60 * 60,      // per 1 hour
    blockDuration: 60 * 60  // 1-hour block on breach
})

/**
 * Consume one token. Returns:
 *   { success: true }
 *   { success: false, msBeforeNext }
 *
 * @param {string} ip
 */
export async function consumeSendOtpIpLimit(ip) {
    try {
        await perIpLimiter.consume(ip || 'unknown')
        return { success: true }
    } catch (rej) {
        return {
            success: false,
            msBeforeNext: rej?.msBeforeNext ?? 60_000
        }
    }
}

import { z } from 'zod'

/**
 * Login schema.
 *
 * Login is email-based. We validate strictly to (a) match the credentials
 * provider's declared fields and (b) prevent NoSQL operator-injection
 * payloads like { email: { $gt: '' } } from ever reaching Mongo.
 *
 * z.string() rejects non-string inputs (numbers, objects, arrays, null),
 * which is the primary defence against NoSQL injection at the auth layer.
 *
 * .strict() — defense-in-depth.
 * No caller spreads parsed.data into Mongo today (both authorize() and
 * verify-otp destructure explicit fields), but every other validator in
 * this codebase is strict and we don't want this one to be the soft spot
 * a future refactor turns into a privilege-escalation vector. Rejecting
 * extras at the parse step makes the guarantee structural, not stylistic.
 */
export const loginSchema = z.object({
    email: z.string().email().max(254).trim().toLowerCase(),
    password: z.string().min(6).max(100)
}).strict()

/**
 * Registration schema.
 *
 * Username is required separately; it must be a string within sane bounds
 * and restricted to a safe character set to avoid surprises in URLs, logs,
 * and Mongo queries.
 *
 * .strict() — same rationale as loginSchema. Particularly important
 * here because /api/auth/verify-otp is a write path — an attacker smuggling
 * `{ role: 'admin' }` through registration would be a critical bug if a
 * future refactor ever switched from explicit destructuring to spread.
 */
export const registerSchema = z.object({
    username: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, dots, underscores, and hyphens')
        .trim(),
    email: z.string().email().max(254).trim().toLowerCase(),
    password: z.string().min(8).max(100)
}).strict()
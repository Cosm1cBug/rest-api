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
 */
export const loginSchema = z.object({
    email: z.string().email().max(254).trim().toLowerCase(),
    password: z.string().min(6).max(100)
})

/**
 * Registration schema.
 *
 * Username is required separately; it must be a string within sane bounds
 * and restricted to a safe character set to avoid surprises in URLs, logs,
 * and Mongo queries.
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
})
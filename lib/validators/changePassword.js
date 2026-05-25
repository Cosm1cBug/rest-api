import { z } from 'zod'

/**
 * Validation for POST /api/user/change-password.
 *
 * `.strict()` rejects unknown fields so nothing else (role / email /
 * keyHash) can be smuggled in via this endpoint.
 */
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(100),
    newPassword:     z.string().min(8).max(100)
}).strict()

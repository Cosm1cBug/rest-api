import { z } from 'zod'

const ROLES = ['basic', 'standard', 'premium', 'admin']

export const adminUserPatchSchema = z.object({
    role: z.enum(ROLES).optional(),
    disabled: z.boolean().optional(),
    endDate: z
        .union([z.string().datetime(), z.null()])
        .optional()
}).strict().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided.' }
)

export const adminUserListQuerySchema = z.object({
    q: z.string().trim().max(128).optional(),
    role: z.enum(ROLES).optional(),
    disabled: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict()

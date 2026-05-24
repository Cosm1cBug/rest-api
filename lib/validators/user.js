import { z } from 'zod'

export const userUpdateSchema = z.object({
    username: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, dots, underscores, and hyphens')
        .trim()
        .optional(),
    image: z
        .string()
        .max(256)
        .regex(/^[A-Za-z0-9_./-]+$/, 'Invalid image reference')
        .optional()
}).strict()  // .strict() rejects unknown fields outright

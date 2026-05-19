import { z } from 'zod'

export const loginSchema = z.object({
    username: z.string().min(3).max(30),
    password: z.string().min(6).max(100)
})

export const registerSchema = z.object({
    username: z.string().min(3).max(30),
    email: z.string().email(),
    password: z.string().min(8).max(100)
})
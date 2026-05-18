import { z } from 'zod'

export const youtubeSchema = z.object({
    url: z.string().url()
})
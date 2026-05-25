import { describe, it, expect } from 'vitest'
import { changePasswordSchema } from '../lib/validators/changePassword.js'

describe('changePasswordSchema', () => {
    it('accepts a valid pair', () => {
        const r = changePasswordSchema.safeParse({
            currentPassword: 'old',
            newPassword: 'newpasswordlongerthan8'
        })
        expect(r.success).toBe(true)
    })

    it('rejects a short new password', () => {
        const r = changePasswordSchema.safeParse({
            currentPassword: 'old',
            newPassword: 'tiny'
        })
        expect(r.success).toBe(false)
    })

    it('rejects extra fields (no role/keyHash smuggling)', () => {
        const r = changePasswordSchema.safeParse({
            currentPassword: 'old',
            newPassword: 'newpasswordlongerthan8',
            role: 'admin'
        })
        expect(r.success).toBe(false)
    })

    it('rejects missing fields', () => {
        expect(changePasswordSchema.safeParse({ newPassword: 'x'.repeat(10) }).success).toBe(false)
        expect(changePasswordSchema.safeParse({ currentPassword: 'old' }).success).toBe(false)
    })
})

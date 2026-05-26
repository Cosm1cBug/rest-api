import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import User from '../models/user.js'

describe('User schema', () => {
    it('creates a user with only username + email + password + role (no API key fields)', () => {
        // Build (don't save) so we hit validation without needing a live DB.
        const u = new User({
            username: 'alice',
            email:    'alice@example.com',
            password: '$2a$12$xxxxxxxxxxxxxxxxxxxxx',
            role:     'basic'
        })
        const err = u.validateSync()
        // If keyHash is still marked required, validateSync() returns a
        // ValidationError. We expect no error.
        expect(err, err && JSON.stringify(err.errors)).toBeUndefined()
    })

    it('still accepts the legacy keyHash field for back-compat', () => {
        const u = new User({
            username: 'legacy',
            email:    'legacy@example.com',
            password: '$2a$12$xxxxxxxxxxxxxxxxxxxxx',
            keyHash:  '$2a$12$yyyyyyyyyyyyyyyyyyyyy',
            keyId:    '0123456789abcdef'
        })
        expect(u.validateSync()).toBeUndefined()
    })
})
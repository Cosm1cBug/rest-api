import bcrypt from 'bcryptjs'
import User from '@/models/user.js'

/**
 * Validates an API key from the `x-api-key` request header.
 *
 * Format: `<keyId>.<secret>` where `keyId` is the 16-char hex lookup key
 * stored in plaintext, and `secret` is a 48-char hex string whose bcrypt
 * hash is stored in `user.keyHash`.
 *
 * Throws on missing / malformed / invalid keys. Returns the user on success.
 */
export async function verifyApiKey(req) {

    const apiKey = req.headers.get('x-api-key')

    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('API Key Missing.')
    }

    // Hard length cap to prevent absurd-input DoS via bcrypt.
    if (apiKey.length > 200) {
        throw new Error('Malformed API key')
    }

    const [keyId, secret] = apiKey.split('.')

    // Strict format check: hex of expected length. This both rejects garbage
    // and guarantees the value we pass to Mongo is a plain primitive string.
    if (!/^[a-f0-9]{16}$/.test(keyId) || !/^[a-f0-9]{48}$/.test(secret || '')) {
        throw new Error('Malformed API key')
    }

    const user = await User.findOne({ keyId: String(keyId) })

    if (!user || !user.keyHash) {
        throw new Error('Invalid API key')
    }

    const valid = await bcrypt.compare(secret, user.keyHash)

    if (!valid) {
        throw new Error('Invalid API key')
    }

    if (user.disabled) {
        throw new Error('Account disabled')
    }

    return user
}
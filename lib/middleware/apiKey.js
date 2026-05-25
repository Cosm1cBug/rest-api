import bcrypt from 'bcryptjs'
import User from '@/models/user.js'
import ApiKey from '@/models/apiKey.js'

/**
 * Validates an API key from the `x-api-key` request header.
 *
 * Throws on missing/malformed/invalid keys, or on accounts that are
 * disabled or whose key has been revoked. Returns the user on success.
 */
export async function verifyApiKey(req) {

    const apiKey = req.headers.get('x-api-key')

    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('API Key Missing.')
    }

    // Hard length cap so a giant string can't grind bcrypt for seconds.
    if (apiKey.length > 200) {
        throw new Error('Malformed API key')
    }

    const [keyId, secret] = apiKey.split('.')

    // Strict format check rejects garbage AND guarantees the value we pass
    // to Mongo is a primitive string (no NoSQL operator injection).
    if (!/^[a-f0-9]{16}$/.test(keyId) || !/^[a-f0-9]{48}$/.test(secret || '')) {
        throw new Error('Malformed API key')
    }

    // --- 1. New-style lookup ---
    const record = await ApiKey.findOne({ keyId: String(keyId) }).lean()

    if (record) {
        if (record.revoked) {
            throw new Error('Invalid API key')
        }

        const valid = await bcrypt.compare(secret, record.keyHash)
        if (!valid) {
            throw new Error('Invalid API key')
        }

        const user = await User.findById(record.userId)
        if (!user) {
            throw new Error('Invalid API key')
        }
        if (user.disabled) {
            throw new Error('Account disabled')
        }

        // Fire-and-forget lastUsedAt bump. We avoid awaiting it to keep
        // request latency unaffected; a missed write is acceptable.
        ApiKey.updateOne(
            { _id: record._id },
            { $set: { lastUsedAt: new Date() } }
        ).catch(err => console.error('[apiKey] lastUsedAt update failed', err.message))

        return user
    }

    // --- 2. Legacy fallback — key stored inline on User document ---
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
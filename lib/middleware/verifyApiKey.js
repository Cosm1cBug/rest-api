import bcrypt from 'bcryptjs'
import User from '@/models/user.js'
import ApiKey from '@/models/apiKey.js'
import { hasScope } from '@/lib/auth/apiKeyScopes.js'

export async function verifyApiKey(req, { scope = null } = {}) {

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

        // Hard expiry — checked BEFORE bcrypt so an expired key costs
        // the server nothing to reject.
        if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
            throw new Error('API key expired')
        }

        const valid = await bcrypt.compare(secret, record.keyHash)
        if (!valid) {
            throw new Error('Invalid API key')
        }

        // Scope check. Empty scopes array == full access (back-compat
        // for keys issued before this feature shipped).
        if (scope && !hasScope(record.scopes, scope)) {
            throw new Error('API key lacks the required scope')
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

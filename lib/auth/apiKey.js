import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import ApiKey from '@/models/apiKey.js'

const BCRYPT_ROUNDS = 12

/**
 * Generate a fresh API key.
 *
 *   keyId   : 16 hex chars (random)
 *   secret  : 48 hex chars (random)
 *   keyHash : bcrypt(secret)
 *   apiKey  : "<keyId>.<secret>" - returned ONCE to the caller, never stored.
 *
 * Use issueApiKey() if you also want the record persisted to MongoDB.
 *
 * @returns {Promise<{ keyId: string, keyHash: string, apiKey: string }>}
 */
export async function generateApiKey() {
    const keyId = crypto.randomBytes(8).toString('hex')      // 16 hex
    const secret = crypto.randomBytes(24).toString('hex')    // 48 hex
    const keyHash = await bcrypt.hash(secret, BCRYPT_ROUNDS)
    const apiKey = `${keyId}.${secret}`
    return { keyId, keyHash, apiKey }
}

/**
 * Generate a new API key AND persist it as an ApiKey document tied to
 * the given user. Returns the raw apiKey (shown ONCE) plus the created
 * record's metadata.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {{ label?: string }} [opts]
 * @returns {Promise<{
 *   apiKey: string,        // <keyId>.<secret> — show once, then forget
 *   keyId:  string,
 *   label:  string,
 *   createdAt: Date
 * }>}
 */
export async function issueApiKey(userId, opts = {}) {
    const { keyId, keyHash, apiKey } = await generateApiKey()
    const label = (opts.label || '').toString().slice(0, 64)

    const doc = await ApiKey.create({
        userId,
        keyId,
        keyHash,
        label
    })

    return {
        apiKey,
        keyId: doc.keyId,
        label: doc.label,
        createdAt: doc.createdAt
    }
}

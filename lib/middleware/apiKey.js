import bcrypt from 'bcryptjs'
import User from '@/models/user.js'

export async function verifyApiKey(req) {
    const apiKey = req.headers.get('x-api-key')

    if (!apiKey) {
        throw new Error('API Key Missing.')
    }

    const [keyId, secret] = apiKey.split('.')

    if (!keyId || !secret) {
        throw new Error('Malformed API key')
    }

    const user = await User.findOne({keyId})

    if (!user) {
        throw new Error('Invalid API key')
    }

    const valid = await bcrypt.compare(secret, user.keyHash) 

    if (!valid) {
        throw new Error('Invalid API key')
    }

    return user
}

import bcrypt from 'bcryptjs'
import User from '@/models/user'

export async function verifyApiKey(key) {
    const key = req.headers.get('x-api-key')

    if (!key) {
        throw new Error('API Key Missing.')
    }

    const users = User.find({})

    for (const user of users) {
        const valid = await bcrypt.compare(key, user.apiKey)

        if (valid) {
            return user
        }
    }

    throw new Error('Invalid API key')
}
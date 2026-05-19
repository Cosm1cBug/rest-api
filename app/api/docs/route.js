import { failure } from '@/lib/apiResponse.js'

export async function GET(req) {
    const adminKey = req.headers.get('x-admin-key')

    if(adminKey !== process.env.ADMIN_KEY) {
        return failure('Unauthorized.', 401)
    }

    return Response.json({
        success: true
    })
}
import { failure } from '@/lib/apiResponse.js'
import { checkAdminKey } from '@/lib/auth/adminKey.js'

export async function GET(req) {

    const denied = checkAdminKey(req)
    if (denied) return failure('Unauthorized.', 401)

    return Response.json({ success: true })
}
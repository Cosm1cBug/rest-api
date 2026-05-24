import crypto from 'crypto'

/**
 * Constant-time comparison of the x-admin-key header against ADMIN_KEY.
 *
 * @param {Request} req
 * @returns {Response | null}
 */
export function checkAdminKey(req) {
    const expected = process.env.ADMIN_KEY

    if (!expected || expected.length < 16) {
        return new Response('Forbidden', { status: 403 })
    }

    const provided = req.headers.get('x-admin-key') || ''

    const expectedBuf = Buffer.from(expected)

    const providedBuf = Buffer.alloc(expectedBuf.length)
    
    Buffer.from(provided).copy(providedBuf)

    const ok =
        provided.length === expected.length &&
        crypto.timingSafeEqual(expectedBuf, providedBuf)

    if (!ok) {
        return new Response('Forbidden', { status: 403 })
    }

    return null
}

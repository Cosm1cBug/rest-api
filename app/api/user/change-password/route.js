import bcrypt from 'bcryptjs'
import connectDB from '@/lib/mongodb.js'
import User from '@/models/user.js'
import PasswordReset from '@/models/passwordReset.js'
import { requireSession } from '@/lib/auth/requireSession.js'
import { requireJson } from '@/lib/auth/requireJson.js'
import { changePasswordSchema } from '@/lib/validators/changePassword.js'
import { clearLoginFailures } from '@/lib/auth/loginLockout.js'

/**
 * POST /api/user/change-password
 *
 * Body: { currentPassword, newPassword }
 *
 * Why we require the current password:
 *   A hijacked session (stolen JWT cookie) would otherwise let the
 *   attacker silently lock the real user out by setting a new password.
 *   Requiring the current password means even a session compromise
 *   can't escalate to permanent account takeover without knowing the
 *   old password.
 *
 * Side effects on success:
 *   - bcrypt-hashed new password persisted
 *   - any in-flight password-reset tokens for this user are wiped
 *     (otherwise a leaked reset link from earlier could still be used
 *      to change the password back)
 *   - login lockout state cleared so the user isn't punished for the
 *     failures that motivated the rotation
 */

const BCRYPT_ROUNDS = 12

/**
 * @openapi
 * /api/user/change-password:
 *   post:
 *     tags: [User]
 *     summary: Change own password (requires current password)
 *     security:
 *       - SessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 8, maxLength: 100 }
 *     responses:
 *       200: { description: Password updated. }
 *       400: { description: New password too weak or identical to current. }
 *       401: { description: Current password incorrect. }
 */
export async function POST(req) {
    const ctDenied = requireJson(req)
    if (ctDenied) return ctDenied

    const guard = await requireSession(req)
    if (!guard.ok) return guard.response

    let body
    try {
        body = await req.json()
    } catch {
        return Response.json(
            { success: false, message: 'Invalid JSON' },
            { status: 400 }
        )
    }

    const parsed = changePasswordSchema.safeParse(body)
    if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || 'Invalid input'
        return Response.json({ success: false, message }, { status: 400 })
    }

    const { currentPassword, newPassword } = parsed.data

    if (currentPassword === newPassword) {
        return Response.json(
            { success: false, message: 'New password must differ from the current password.' },
            { status: 400 }
        )
    }

    await connectDB()

    const user = await User.findById(guard.token.id).select('password disabled')
    if (!user) {
        return Response.json(
            { success: false, message: 'User not found' },
            { status: 404 }
        )
    }

    if (user.disabled) {
        return Response.json(
            { success: false, message: 'Account disabled' },
            { status: 403 }
        )
    }

    // Constant-time compare against the stored hash. If the user has
    // no password (e.g. future OAuth-only accounts), reject — they
    // shouldn't be using this endpoint at all.
    if (!user.password) {
        return Response.json(
            { success: false, message: 'Password change not available for this account' },
            { status: 400 }
        )
    }

    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) {
        return Response.json(
            { success: false, message: 'Current password is incorrect.' },
            { status: 400 }
        )
    }

    // Hash the new one and write atomically. We don't include the
    // current password in the filter (we already verified it above);
    // updating by _id alone is correct.
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await User.updateOne(
        { _id: user._id },
        { $set: { password: passwordHash } }
    )

    // Burn every outstanding reset token — they're invalidated by the
    // password change. Otherwise a leaked link from 5 minutes ago could
    // be used to revert.
    await PasswordReset.deleteMany({ userId: user._id }).catch(err =>
        console.error('[change-password] reset cleanup failed:', err.message)
    )

    // Clear any failure/lockout state. If the user just changed because
    // they were locked out, they should be able to sign in immediately.
    await clearLoginFailures(user._id).catch(err =>
        console.error('[change-password] clearLoginFailures failed:', err.message)
    )

    return Response.json(
        {
            success: true,
            message: 'Password updated.'
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
    )
}

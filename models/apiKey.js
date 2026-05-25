import mongoose from 'mongoose'

/**
 * API key - one document per active key.
 *
 *   keyId    : 16-char hex; stored plaintext, indexed for fast lookup.
 *              Safe to expose in UI (it is the public handle, not a credential).
 *
 *   keyHash  : bcrypt hash of the 48-char secret half. The plaintext secret
 *              is shown to the user ONCE at creation time and then thrown away.
 *              A DB leak therefore does NOT expose any usable keys.
 *
 *   userId   : owner. Indexed so /api/user/api-keys can list a user's keys
 *              without a collection scan.
 *
 *   label    : optional human name ("production", "ci runner", etc.). Helps
 *              users decide which key to revoke if one leaks.
 *
 *   lastUsedAt : updated by verifyApiKey() on each successful auth. Lets
 *                users / admins spot stale or compromised keys.
 *
 *   revoked    : soft-delete flag. We keep the document so audit logs that
 *                reference the keyId still resolve to something meaningful.
 *                verifyApiKey() rejects revoked keys.
 *
 */
const ApiKeySchema = new mongoose.Schema({
    keyId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    keyHash: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    label: {
        type: String,
        trim: true,
        maxlength: 64,
        default: ''
    },
    lastUsedAt: {
        type: Date,
        default: null
    },
    revoked: {
        type: Boolean,
        default: false,
        index: true
    },
    revokedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
})

export default mongoose.models.ApiKey || mongoose.model('ApiKey', ApiKeySchema)
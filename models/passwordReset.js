import mongoose from 'mongoose'

const PasswordResetSchema = new mongoose.Schema({
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }
    },
    usedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
})

export default mongoose.models.PasswordReset
    || mongoose.model('PasswordReset', PasswordResetSchema)

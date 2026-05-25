import mongoose from 'mongoose'

const AuditLogSchema = new mongoose.Schema({
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    actorEmail: {
        type: String,
        required: true   // denormalised so the log stays readable even if the user is deleted
    },
    action: {
        type: String,
        required: true,
        index: true
    },
    targetType: {
        type: String,
        default: 'user'
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        default: null
    },
    targetLabel: {
        type: String,
        default: ''   // free-text label like the target's email/username for human readability
    },
    before: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    after: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    ip: {
        type: String,
        default: 'unknown'
    },
    userAgent: {
        type: String,
        default: 'unknown'
    }
}, {
    timestamps: true   // adds createdAt + updatedAt
})

// Compound index for "show me everything actor X did" queries.
AuditLogSchema.index({ actorId: 1, createdAt: -1 })
// And "show me everything done to target Y".
AuditLogSchema.index({ targetId: 1, createdAt: -1 })

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema)

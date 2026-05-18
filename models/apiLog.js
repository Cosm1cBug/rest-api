import mongoose from 'mongoose'

const apiLogSchema = new mongoose.Schema({

    userId: {
        type: String,
        default: 'anonymous',
        index: true
    },
    endpoint: {
        type: String,
        required: true,
        index: true
    },
    method: {
        type: String,
        required: true
    },
    status: {
        type: Number,
        required: true
    },
    success: {
        type: Boolean,
        required: true,
        index: true
    },
    latency: {
        type: Number,
        required: true
    },
    cacheHit: {
        type: Boolean,
        default: false
    },
    ip: {
        type: String,
        index: true
    },
    country: String,
    region: String,
    city: String,

    userAgent: String,

    quotaUsed: {
        type: Number,
        default: 1
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '90d',
        index: true
    }
})

apiLogSchema.index({ createdAt: 1 })
apiLogSchema.index({ endpoint: 1, createdAt: 1 })
apiLogSchema.index({ userId: 1, createdAt: 1 })

export default mongoose.models.ApiLog || mongoose.model('ApiLog', apiLogSchema)

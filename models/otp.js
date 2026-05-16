import mongoose from 'mongoose'

const OtpSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true 
    },
    code: { 
        type: String, 
        required: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now, 
        expires: 300
    },
    expiresAt: { 
        type: Date, 
        required: true 
    }
}, { 
    timestamps: true 
});

export default mongoose.models.Otp || mongoose.model('Otp', OtpSchema);

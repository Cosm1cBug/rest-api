import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    apiKey: {
        type: String,
        index: true
    },
    keyId: {
        type: String,
        index: true
    },
    keyHash: {
        type: String
    },
    name: {
        type: String
    },
    email: { 
        type: String, 
        unique: true,
        required: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    status: { 
        type: String, 
        default: "basic" 
    },
    endDate: {
        type: Date
    },
    image: { 
        type: String, 
        default: "default.jpg" 
    },
    request_today: { 
        type: Number, 
        default: 0 
    },
    request_all: { 
        type: Number, 
        default: 0 
    },
    updatedAt: Date
});

UserSchema.index({ email: 1 })
UserSchema.index({ apiKey: 1 })

export default mongoose.models.User || mongoose.model("User", UserSchema);
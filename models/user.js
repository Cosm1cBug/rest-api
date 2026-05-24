import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    keyId: {
        type: String,
        unique: true,
        index: true,
        sparse: true
    },
    keyHash: {
        type: String,
        required: true
    },
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        index: true
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
    role: {
        type: String,
        enum: ['basic', 'standard', 'premium', 'admin'],
        default: 'basic',
        index: true
    },
    endDate: {
        type: Date
    },
    disabled: {
        type: Boolean,
        default: false,
        index: true
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
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    }
},
{
    timestamps: true
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    apiKey: {
        type: String,
        unique: true,
        index: true
    },
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
        enum: ['basic', 'standard', 'premium', 'admin'],
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
    }
},
{
    timestamps: true
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
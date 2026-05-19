import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    apiKey: String,
    keyId: {
        type: String,
        index: true
    },
    keyHash: string,
    name: String,
    email: { 
        type: String, 
        unique: true 
    },
    password: String,
    status: { 
        type: String, 
        default: "basic" 
    },
    endDate: Date,
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
    updateAt: Date
});

UserSchema.index({ email: 1 })
UserSchema.index({ apiKey: 1 })

export default mongoose.models.User || mongoose.model("User", UserSchema);
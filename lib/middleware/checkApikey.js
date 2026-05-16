import dbConnect from '../mongodb.js'
import User from '../../models/user.js'

export default async function checkApiKey(req, res, next) {
    const apiKey = req.query.apikey;

    if (!apiKey) return res.status(401).json({ message: 'API Key required' });

    await dbConnect();

    const user = await User.findOne({ apikey: apiKey });
    if (!user) return res.status(403).json({ message: 'Invalid API Key' });

    if (user.request_today >= limit[user.status]) {
        return res.status(403).json({ message: 'API Key limit exceeded' });
    }

    const now = new Date();
    const formatted = now.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress;

    console.log(`\x1b[31m-->\x1b[0m API Key used by \x1b[33m${user.name}\x1b[0m (\x1b[32m${apiKey}\x1b[0m) from \x1b[35m${ip}\x1b[0m at \x1b[90m${formatted}\x1b[0m`);

    user.request_today += 1;
    user.request_all += 1;
    await user.save();

    req.user = user;
    next();
}

const limit = {
    "basic": 100,
    "premium": 1000,
    "vip": 10000,
    "admin": 100000
}
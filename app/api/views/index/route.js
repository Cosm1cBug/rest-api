import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb.js'
import PageView from '@/models/pageView.js'
import { redis } from '@/lib/redis.js'
import { clientIp } from '@/lib/clientIp.js'

const SLUG_RE = /^[a-z0-9_-]{1,64}$/
const MAX_IPS = 1000
const DEBOUNCE_SECONDS = 5 * 60

export async function POST(req) {
    let slug = 'index'

    try {
        const body = await req.json().catch(() => ({}))
        if (body && typeof body.slug === 'string' && SLUG_RE.test(body.slug)) {
            slug = body.slug
        }
    } catch {
        // body is optional
    }

    const ip = clientIp(req)

    // --- Debounce: at most one count per (slug, ip) per window ---
    let shouldIncrement = true
    try {
        const debounceKey = `views:debounce:${slug}:${ip}`
        // SET NX EX  →  true iff key was newly created
        const set = await redis.set(debounceKey, '1', 'EX', DEBOUNCE_SECONDS, 'NX')
        shouldIncrement = set === 'OK'
    } catch (err) {
        console.error('[views] debounce check failed:', err.message)
        // Fail open on the increment so a Redis blip doesn't black out counts;
        // the request is anonymous and idempotent enough that it's fine.
    }

    let views = 0
    try {
        await connectDB()

        if (shouldIncrement) {
            // Upsert + atomic $inc + add IP (capped via $slice).
            const doc = await PageView.findOneAndUpdate(
                { slug },
                {
                    $inc: { views: 1 },
                    $push: {
                        ips: {
                            $each: [ip],
                            $slice: -MAX_IPS    // keep only the last MAX_IPS
                        }
                    }
                },
                { upsert: true, new: true, projection: { views: 1 } }
            ).lean()
            views = doc?.views || 0
        } else {
            // Read current value without writing.
            const doc = await PageView.findOne({ slug }, { views: 1 }).lean()
            views = doc?.views || 0
        }
    } catch (err) {
        console.error('[views] Mongo error:', err.message)
        // Fall through to returning views=0 rather than 500ing — page-view
        // tracking failures should never break the user's page render.
    }

    return NextResponse.json(
        { success: true, slug, views },
        { headers: { 'Cache-Control': 'no-store' } }
    )
}

import { getTopIPs } from '@/lib/ipAnalytics.js'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

export async function GET(req) {

    const denied = await requireAdmin(req)
    if (denied) return denied

    const topIPs = await getTopIPs()

    return NextResponse.json({ topIPs })
}

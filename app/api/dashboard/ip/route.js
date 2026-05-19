import { getTopIPs } from '@/lib/ipAnalytics.js'
import { NextResponse } from 'next/server'

export async function GET() {

    return NextResponse.json({

        topIPs: 
            getTopIPs()
    })
}
import { getTopIPs } from '@/lib/ipAnalytics.js'

export async function GET() {

    return NextResponse.json({

        topIPs: 
            getTopIPs()
    })
}
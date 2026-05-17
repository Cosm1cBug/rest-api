import {
    getTopIPs
}
from '@/lib/ipAnalytics.js'

export async function GET() {

    return Response.json({

        topIPs:
            getTopIPs()
    })
}
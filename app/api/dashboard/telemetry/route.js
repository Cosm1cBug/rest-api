import { getTelemetry } from '@/lib/telemetry.js'
import { requireAdmin } from '@/lib/auth/requireAdmin.js'

export async function GET() {
    
    const denied = await requireAdmin(req)
    if (denied) return denied

    return Response.json(
        getTelemetry()
    )
}

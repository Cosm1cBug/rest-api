import { getTelemetry } from '@/lib/telemetry.js'

export async function GET() {

    return Response.json(
        getTelemetry()
    )
}

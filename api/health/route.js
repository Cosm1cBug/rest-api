export async function GET() {
    return Response.json({
        success: true,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now()
    })
}
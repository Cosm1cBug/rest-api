export async function GET() {
    return Response.json({
        uptime: process.uptime()
        memory: process.memoryUsage()
        cpu: process.cpuUsage()
        pid: process.pid
    })
}
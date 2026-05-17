import os from 'os'

export async function GET() {

    return Response.json({

        cpuLoad: os.loadavg(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        platform: os.platform(),
        cpus:os.cpus().length
    })
}
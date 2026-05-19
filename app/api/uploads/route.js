import fs from 'fs/promises'
import path from 'path'

const UPLOADS_DIR = path.join(process.cwd(), 'tmp')

const EXTENSION_MIME = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf'
}

function getMimeType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase()
    return EXTENSION_MIME[ext] || 'application/octet-stream'
}

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const rawFilename = searchParams.get('filename')

    if (!rawFilename) {
        return Response.json(
            { success: false, error: 'Missing filename parameter' },
            { status: 400 }
        )
    }

    // Sanitize: strip all directory components so traversal like
    // ../../etc/passwd is reduced to just 'passwd'
    const filename = path.basename(rawFilename)

    // Reject filenames with null bytes or that are just dots
    if (filename === '.' || filename === '..' || filename.includes('\0')) {
        return Response.json(
            { success: false, error: 'Invalid filename' },
            { status: 400 }
        )
    }

    const filePath = path.join(UPLOADS_DIR, filename)

    // Double-check the resolved path is still inside UPLOADS_DIR
    // (defence-in-depth against any edge cases path.basename misses)
    if (!filePath.startsWith(UPLOADS_DIR + path.sep)) {
        return Response.json(
            { success: false, error: 'Access denied' },
            { status: 403 }
        )
    }

    try {
        await fs.access(filePath, fs.constants.R_OK)
    } catch {
        return Response.json(
            { success: false, error: 'File not found' },
            { status: 404 }
        )
    }

    let stat
    try {
        stat = await fs.stat(filePath)
    } catch {
        return Response.json(
            { success: false, error: 'Could not read file metadata' },
            { status: 500 }
        )
    }

    const mimeType = getMimeType(filename)

    // Stream the file using the Web Streams API (App Router compatible)
    const nodeStream = fs.createReadStream(filePath)

    const webStream = new ReadableStream({
        start(controller) {
            nodeStream.on('data', (chunk) => {
                controller.enqueue(new Uint8Array(chunk))
            })
            nodeStream.on('end', () => {
                controller.close()
            })
            nodeStream.on('error', (err) => {
                controller.error(err)
            })
        },
        cancel() {
            nodeStream.destroy()
        }
    })

    return new Response(webStream, {
        status: 200,
        headers: {
            'Content-Type': mimeType,
            'Content-Length': String(stat.size),
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff'
        }
    })
}
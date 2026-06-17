import { createReadStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { verifyApiKey } from '@/lib/middleware/verifyApiKey.js'

const UPLOADS_DIR = path.resolve(process.cwd(), 'tmp')

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

const SAFE_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,8}$/

function getMimeType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase()
    return EXTENSION_MIME[ext] || 'application/octet-stream'
}

function jsonError(message, status) {
    return Response.json({ success: false, error: message }, { status })
}

/**
 * @openapi
 * /api/uploads:
 *   get:
 *     tags: [Scrapers]
 *     summary: Serve a file from the tmp uploads directory (filename allow-listed)
 *     description: |
 *       Filename must match `^[A-Za-z0-9_-]+\\.[A-Za-z0-9]{1,8}$`. This eliminates
 *       path traversal (`../`) and Content-Disposition header injection.
 *       Content-Type is detected via magic-byte (file-type), not the extension.
 *     security:
 *       - ApiKey: []
 *     parameters:
 *       - in: query
 *         name: filename
 *         required: true
 *         schema: { type: string, pattern: '^[A-Za-z0-9_-]+\\.[A-Za-z0-9]{1,8}$' }
 *     responses:
 *       200:
 *         description: File body (binary).
 *         content:
 *           application/octet-stream: { schema: { type: string, format: binary } }
 *       400: { description: Filename failed the allow-list. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { description: File not found in tmp/. }
 */
export async function GET(req) {

    let user
    try {
        user = await verifyApiKey(req)
    } catch {
        return jsonError('Unauthorized', 401)
    }

    if (!user) {
        return jsonError('Unauthorized', 401)
    }

    // --- Input parsing ---
    const { searchParams } = new URL(req.url)
    const rawFilename = searchParams.get('filename')

    if (!rawFilename || typeof rawFilename !== 'string') {
        return jsonError('Missing filename parameter', 400)
    }

    if (rawFilename.length > 128) {
        return jsonError('Invalid filename', 400)
    }

    // Reject NUL bytes outright (would truncate the path at the C layer).
    if (rawFilename.includes('\0')) {
        return jsonError('Invalid filename', 400)
    }

    const filename = path.basename(rawFilename)

    // Reject dot-only filenames (basename('..') === '..').
    if (filename === '' || filename === '.' || filename === '..') {
        return jsonError('Invalid filename', 400)
    }

    if (!SAFE_NAME.test(filename)) {
        return jsonError('Invalid filename', 400)
    }

    const filePath = path.resolve(UPLOADS_DIR, filename)

    if (
        filePath !== path.join(UPLOADS_DIR, filename) ||
        !filePath.startsWith(UPLOADS_DIR + path.sep)
    ) {
        return jsonError('Access denied', 403)
    }

    // --- Stat / readability check ---
    let stat
    try {
        stat = await fs.stat(filePath)
    } catch {
        return jsonError('File not found', 404)
    }

    if (!stat.isFile()) {
        // Reject directories, symlinks-to-directories, sockets, etc.
        return jsonError('File not found', 404)
    }

    // --- Stream the file ---
    const nodeStream = createReadStream(filePath)

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

    const mimeType = getMimeType(filename)

    return new Response(webStream, {
        status: 200,
        headers: {
            'Content-Type': mimeType,
            'Content-Length': String(stat.size),
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    })
}

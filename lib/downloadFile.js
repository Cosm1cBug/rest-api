import fs from 'fs'
import path from 'path'
import { fileTypeFromBuffer } from 'file-type'
import { validateUrl } from '@/lib/security/ssrf.js'

/**
 * Download or convert a file from various sources and optionally save to tmp/.
 *
 * @param {string | Buffer | ArrayBuffer} input - URL, file path, base64 string, or buffer.
 * @param {boolean} [saveToFile=false] - If true, save the buffer to tmp/ and return a filename.
 * @returns {Promise<{
 *   filename?: string,
 *   mime: string,
 *   ext: string,
 *   data: Buffer,
 *   deleteFile: () => Promise<void>
 * }>}
 */
export async function downloadFile(input, saveToFile = false) {
    let publicFilename
    let fullPath
    let buffer

    switch (true) {
        case Buffer.isBuffer(input):
            buffer = input
            break

        case input instanceof ArrayBuffer:
            buffer = Buffer.from(input)
            break

        // Data URI:  data:image/png;base64,iVBOR...
        case typeof input === 'string' && /^data:.*?\/.*?;base64,/i.test(input):
            buffer = Buffer.from(input.split(',')[1], 'base64')
            break

        // Plain base64 string (only base64 chars)
        case typeof input === 'string' && /^[A-Za-z0-9+/]+=*$/.test(input) && input.length % 4 === 0:
            buffer = Buffer.from(input, 'base64')
            break

        // Remote URL — validate first to prevent SSRF
        case typeof input === 'string' && /^https?:\/\//.test(input):
            await validateUrl(input)
            buffer = await fetchWithRetry(input, 3)
            break

        // Local file path
        case typeof input === 'string' && fs.existsSync(input):
            fullPath = input
            buffer = await fs.promises.readFile(input)
            break

        // Fallback: treat as raw string bytes
        case typeof input === 'string':
            buffer = Buffer.from(input)
            break

        default:
            buffer = Buffer.alloc(0)
    }

    if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('Result is not a buffer')
    }

    const type = await fileTypeFromBuffer(buffer) || {
        mime: 'application/octet-stream',
        ext: 'bin'
    }

    if (saveToFile && !fullPath) {
        const uploadsDir = path.join(process.cwd(), 'tmp')

        await fs.promises.mkdir(uploadsDir, { recursive: true })

        const name = `${Date.now()}.${type.ext}`
        publicFilename = `/api/uploads/${name}`
        fullPath = path.join(uploadsDir, name)

        await fs.promises.writeFile(fullPath, buffer)
    }

    return {
        filename: publicFilename,
        ...type,
        data: buffer,
        deleteFile: () =>
            fullPath ? fs.promises.unlink(fullPath) : Promise.resolve()
    }
}

/**
 * Fetch a URL with retry logic.
 * Uses native fetch (Node 18+) - no node-fetch needed.
 *
 * @param {string} url
 * @param {number} retries
 * @param {number} delayMs
 * @returns {Promise<Buffer>}
 */
async function fetchWithRetry(url, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': '*/*'
                },
                signal: AbortSignal.timeout(10_000)     // replaces the old timeout option
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            // FIX: response.buffer() is node-fetch v2 only and not available in
            // native fetch or node-fetch v3. Use arrayBuffer() + Buffer.from() instead.
            const arrayBuffer = await response.arrayBuffer()
            return Buffer.from(arrayBuffer)

        } catch (err) {
            if (i === retries - 1) throw err
            await new Promise(res => setTimeout(res, delayMs * Math.pow(2, i)))
        }
    }
}
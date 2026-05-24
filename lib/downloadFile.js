import fs from 'fs'
import path from 'path'
import { fileTypeFromBuffer } from 'file-type'
import { safeFetch } from '@/lib/security/ssrf.js'
import { validateUpload } from '@/lib/uploadValidation.js'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024 // 10 MiB

/**
 * Download or convert a file from various sources and optionally save to tmp/.
 *
 * @param {string | Buffer | ArrayBuffer} input - URL, file path, base64 string, or buffer.
 * @param {boolean | { saveToFile?: boolean, maxBytes?: number }} [optsOrSave=false]
 *        Legacy: a boolean acts as `saveToFile`. New: pass an object to also
 *        override `maxBytes`.
 * @returns {Promise<{
 *   filename?: string,
 *   mime: string,
 *   ext: string,
 *   data: Buffer,
 *   deleteFile: () => Promise<void>
 * }>}
 */
export async function downloadFile(input, optsOrSave = false) {

    // Back-compat: allow the old boolean second arg.
    const opts = typeof optsOrSave === 'boolean'
        ? { saveToFile: optsOrSave }
        : (optsOrSave || {})

    const saveToFile = Boolean(opts.saveToFile)
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

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

        // Remote URL — SSRF-validated fetch via safeFetch (resolves DNS once,
        // connects to the resolved IP, enforces size + timeout).
        case typeof input === 'string' && /^https?:\/\//.test(input):
            buffer = await fetchUrl(input, maxBytes)
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

    if (buffer.length > maxBytes) {
        throw new Error(`Input exceeds maximum size of ${maxBytes} bytes`)
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
        await validateUpload(buffer)
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
 * Fetch a URL with retry logic on top of safeFetch().
 *
 * safeFetch handles: SSRF validation, DNS-rebinding mitigation, size cap,
 * timeout, and redirect policy. We add a small exponential-backoff retry
 * for transient network errors.
 *
 * @param {string} url
 * @param {number} maxBytes
 * @param {number} [retries=3]
 * @param {number} [delayMs=1000]
 * @returns {Promise<Buffer>}
 */
async function fetchUrl(url, maxBytes, retries = 3, delayMs = 1000) {
    let lastErr
    for (let i = 0; i < retries; i++) {
        try {
            const res = await safeFetch(url, {
                maxBytes,
                timeoutMs: 10_000,
                followRedirects: false
            })

            if (res.status < 200 || res.status >= 300) {
                throw new Error(`HTTP ${res.status}`)
            }

            return res.body
        } catch (err) {
            lastErr = err
            // Do not retry SSRF / size / protocol violations.
            if (
                /Blocked|Invalid URL|exceeds size cap|Redirect not allowed|Credentials in URL/.test(err.message)
            ) {
                throw err
            }
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delayMs * Math.pow(2, i)))
            }
        }
    }
    throw lastErr
}

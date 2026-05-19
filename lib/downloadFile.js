import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileTypeFromBuffer } from 'file-type';
import { validateUrl } from '@/lib/security/ssrf.js'
/**
 * Download atau konversi file dari berbagai sumber dan menyimpannya ke public/uploads jika diminta.
 * 
 * @param {string | Buffer | ArrayBuffer} input - Bisa berupa URL, path, base64, atau buffer.
 * @param {boolean | string} [saveToFile=false] - `false` untuk tidak simpan, `true` untuk nama otomatis, `string` untuk custom nama file.
 * @returns {Promise<{
 *   res?: Response,
 *   filename?: string,
 *   mime: string,
 *   ext: string,
 *   data: Buffer,
 *   deleteFile: () => Promise<void>
 * }>}
 */
export async function downloadFile(input, saveToFile = false) {
    let res;
    let publicFilename;
    let fullPath;
    let buffer;

    switch (true) {
        case Buffer.isBuffer(input):
            buffer = input;
            break;

        case input instanceof ArrayBuffer:
            buffer = Buffer.from(input);
            break;

        case typeof input === 'string' && /^data:.*?\/.*?;base64,/i.test(input):
            buffer = Buffer.from(input.split(',')[1], 'base64');
            break;

        case typeof input === 'string' && /^[\w+/=]+$/.test(input):
            buffer = Buffer.from(input, 'base64');
            break;

        case typeof input === 'string' && /^https?:\/\//.test(input):
            await validateUrl(input)
            buffer = await fetchWithRetry(input, 3);
            break;

        case typeof input === 'string' && fs.existsSync(input):
            fullPath = input;
            buffer = fs.readFileSync(input);
            break;

        case typeof input === 'string':
            buffer = Buffer.from(input);
            break;

        default:
            buffer = Buffer.alloc(0);
    }

    if (!Buffer.isBuffer(buffer)) {
        throw new TypeError('Result is not a buffer');
    }

    const type = await fileTypeFromBuffer(buffer) || {
        mime: 'application/octet-stream',
        ext: 'bin'
    };

    if (saveToFile && !fullPath) {
        const uploadsDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const name = `${Date.now()}.${type.ext}`;

        publicFilename = `/api/uploads/${name}`;
        fullPath = path.join(uploadsDir, name);

        await fs.promises.writeFile(fullPath, buffer);
    }

    return {
        res,
        filename: publicFilename,
        ...type,
        data: buffer,
        deleteFile: () => fullPath ? fs.promises.unlink(fullPath) : Promise.resolve()
    };
}

async function fetchWithRetry(url, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
                timeout: 10000
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.buffer();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(res => setTimeout(res, delayMs));
        }
    }
}
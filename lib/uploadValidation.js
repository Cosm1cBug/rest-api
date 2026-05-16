import { fileTypeFromBuffer } from 'file-type'

const allowedMime = [
    // Images
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/gif',
    'image/webp',
   // 'image/svg+xml',
   // 'image/bmp',

    // Videos
    'video/mp4',
    'video/mpeg',
    'video/webm',
    'video/ogg',
   // 'video/x-msvideo',      // .avi
   // 'video/quicktime',      // .mov
   // 'video/x-matroska',     // .mkv

    // Audio
    'audio/mpeg',           // .mp3
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',            // .m4a
    'audio/aac',

    // Documents
   // 'application/pdf',

    // ZIP / Archives
   // 'application/zip',
   // 'application/x-zip-compressed',
   // 'application/x-rar-compressed',
    //'application/x-7z-compressed',

    // Text / Office (optional)
   // 'text/plain',
   // 'application/msword', // .doc
   // 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
   // 'application/vnd.ms-excel', // .xls
   // 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
]

export async function validateUpload(buffer) {
    const type = await fileTypeFromBuffer(buffer)

    if (!type) {
        throw new Error('Unknown file type')
    }

    if (!allowedMime.includes(type.mime)) {
        throw new Error('Filetype not allowed')
    }

    return type
}
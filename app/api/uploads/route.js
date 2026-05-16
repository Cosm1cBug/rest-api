import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

const handler = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).end();

    const { filename } = req.query;
    if (!filename) {
        return res.status(400).json({
            status: false,
            message: 'Missing filename',
        });
    }

    const filePath = path.join(process.cwd(), 'tmp', filename);

    try {
        await fs.promises.access(filePath);

        const mimeType = mime.lookup(filename) || 'application/octet-stream';
        const stat = await fs.promises.stat(filePath);

        res.writeHead(200, {
            'Content-Type': mimeType,
            'Content-Length': stat.size,
            'Content-Disposition': `inline; filename="${filename}"`,
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            res.status(500).end();
        });
    } catch (error) {
        console.error('Error accessing file:', error);
        if (error.code === 'ENOENT') {
            return res.status(404).json({
                status: false,
                message: 'File not found',
            });
        }
        return res.status(500).json({
            status: false,
            message: 'Internal server error',
        });
    }
};

export default handler;
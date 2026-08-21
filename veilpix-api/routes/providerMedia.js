const express = require('express');
const { Readable } = require('stream');
const { isValidProviderMediaSignature } = require('../utils/providerMediaUrl');

const router = express.Router();
const TEMP_IMAGE_BUCKET = 'temp-images';
const PROVIDER_MEDIA_TIMEOUT_MS = 60_000;
const TEMP_FILENAME_PATTERN = /^\d{10,}_[a-f0-9]{16}\.[a-z0-9]+$/i;

function directStorageObjectUrl(filename) {
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    if (!supabaseUrl) throw new Error('SUPABASE_URL is unavailable');
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return `https://${projectRef}.storage.supabase.co/storage/v1/object/public/${TEMP_IMAGE_BUCKET}/${encodeURIComponent(filename)}`;
}

async function serveProviderMedia(req, res) {
    const filename = req.params.filename;
    const expires = typeof req.query.expires === 'string' ? req.query.expires : '';
    const signature = typeof req.query.signature === 'string' ? req.query.signature : '';

    if (!TEMP_FILENAME_PATTERN.test(filename)) {
        return res.status(400).json({ error: 'Invalid media filename' });
    }
    if (!isValidProviderMediaSignature(filename, expires, signature)) {
        return res.status(403).json({ error: 'Invalid or expired media URL' });
    }

    try {
        const upstreamHeaders = {};
        if (req.headers.range) upstreamHeaders.Range = req.headers.range;
        const upstream = await fetch(directStorageObjectUrl(filename), {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers: upstreamHeaders,
            signal: AbortSignal.timeout(PROVIDER_MEDIA_TIMEOUT_MS)
        });

        if (!upstream.ok && upstream.status !== 206) {
            console.error(`Provider media fetch failed for ${filename}: HTTP ${upstream.status}`);
            return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Provider media is unavailable' });
        }

        for (const headerName of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
            const value = upstream.headers.get(headerName);
            if (value) res.setHeader(headerName, value);
        }
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(upstream.status);

        if (req.method === 'HEAD' || !upstream.body) return res.end();

        const stream = Readable.fromWeb(upstream.body);
        stream.on('error', (error) => {
            console.error(`Provider media stream failed for ${filename}:`, error.message);
            if (!res.headersSent) res.status(502).end();
            else res.destroy(error);
        });
        stream.pipe(res);
    } catch (error) {
        console.error(`Provider media request failed for ${filename}:`, error.message);
        if (!res.headersSent) res.status(502).json({ error: 'Provider media is unavailable' });
        else res.destroy(error);
    }
}

router.head('/:filename', serveProviderMedia);
router.get('/:filename', serveProviderMedia);

module.exports = router;

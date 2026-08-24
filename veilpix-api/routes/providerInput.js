const express = require('express');
const { Readable } = require('stream');
const { getSupabaseClient } = require('../utils/database');
const { isValidProviderMediaSignature } = require('../utils/providerMediaUrl');

const router = express.Router();
const PROVIDER_INPUT_BUCKET = 'provider-inputs';
const PROVIDER_INPUT_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,500}$/;
const OBJECT_PATH_PATTERN = /^[a-f0-9]{24}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i;

async function serveProviderInput(req, res) {
    const token = String(req.params.token || '');
    const expires = typeof req.query.expires === 'string' ? req.query.expires : '';
    const signature = typeof req.query.signature === 'string' ? req.query.signature : '';
    if (!TOKEN_PATTERN.test(token) || !isValidProviderMediaSignature(token, expires, signature)) {
        return res.status(403).json({ error: 'Invalid or expired provider input URL' });
    }

    let objectPath;
    try {
        objectPath = Buffer.from(token, 'base64url').toString('utf8');
    } catch {
        return res.status(400).json({ error: 'Invalid provider input token' });
    }
    if (!OBJECT_PATH_PATTERN.test(objectPath) || objectPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid provider input path' });
    }

    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.storage
            .from(PROVIDER_INPUT_BUCKET)
            .createSignedUrl(objectPath, 10 * 60);
        if (error || !data?.signedUrl) {
            return res.status(404).json({ error: 'Provider input is unavailable' });
        }

        const headers = {};
        if (req.headers.range) headers.Range = req.headers.range;
        const upstream = await fetch(data.signedUrl, {
            method: req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers,
            signal: AbortSignal.timeout(PROVIDER_INPUT_TIMEOUT_MS)
        });
        if (!upstream.ok && upstream.status !== 206) {
            return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Provider input is unavailable' });
        }

        for (const headerName of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
            const value = upstream.headers.get(headerName);
            if (value) res.setHeader(headerName, value);
        }
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(upstream.status);
        if (req.method === 'HEAD' || !upstream.body) return res.end();

        const stream = Readable.fromWeb(upstream.body);
        stream.on('error', (streamError) => {
            console.error('Provider input stream failed:', streamError.message);
            if (!res.headersSent) res.status(502).end();
            else res.destroy(streamError);
        });
        stream.pipe(res);
    } catch (error) {
        console.error('Provider input relay failed:', error.message);
        if (!res.headersSent) res.status(502).json({ error: 'Provider input is unavailable' });
        else res.destroy(error);
    }
}

router.head('/:token', serveProviderInput);
router.get('/:token', serveProviderInput);

module.exports = router;

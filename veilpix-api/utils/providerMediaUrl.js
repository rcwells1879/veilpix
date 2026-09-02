const crypto = require('crypto');

const DEFAULT_PROVIDER_MEDIA_BASE_URL = 'https://api.veilstudio.io/api/provider-media';
const DEFAULT_PROVIDER_MEDIA_TTL_SECONDS = 15 * 60;

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function signingSecret(options = {}) {
    return options.signingSecret
        || process.env.PROVIDER_MEDIA_SIGNING_SECRET
        || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function createProviderMediaSignature(filename, expires, options = {}) {
    const secret = signingSecret(options);
    if (!secret) throw new Error('Provider media signing secret is unavailable');

    return crypto
        .createHmac('sha256', secret)
        .update(`${filename}:${expires}`)
        .digest('hex');
}

function createProviderMediaUrl(filename, options = {}) {
    const baseUrl = (options.baseUrl
        || process.env.PROVIDER_MEDIA_BASE_URL
        || DEFAULT_PROVIDER_MEDIA_BASE_URL).replace(/\/+$/, '');
    const ttlSeconds = positiveInteger(
        options.ttlSeconds || process.env.PROVIDER_MEDIA_URL_TTL_SECONDS,
        DEFAULT_PROVIDER_MEDIA_TTL_SECONDS
    );
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const expires = Math.floor(nowMs / 1000) + ttlSeconds;
    const signature = createProviderMediaSignature(filename, expires, options);

    return `${baseUrl}/${encodeURIComponent(filename)}?expires=${expires}&signature=${signature}`;
}

function isValidProviderMediaSignature(filename, expiresValue, signatureValue, options = {}) {
    if (!/^\d+$/.test(String(expiresValue || ''))) return false;
    if (!/^[a-f0-9]{64}$/i.test(String(signatureValue || ''))) return false;

    const expires = Number(expiresValue);
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    if (!Number.isSafeInteger(expires) || expires < Math.floor(nowMs / 1000)) return false;

    const expected = createProviderMediaSignature(filename, expires, options);
    const actualBuffer = Buffer.from(String(signatureValue), 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = {
    DEFAULT_PROVIDER_MEDIA_BASE_URL,
    createProviderMediaSignature,
    createProviderMediaUrl,
    isValidProviderMediaSignature
};

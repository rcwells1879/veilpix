const crypto = require('crypto');
const { getSupabaseClient } = require('./database');
const { createProviderMediaUrl } = require('./providerMediaUrl');

const PROVIDER_INPUT_BUCKET = 'provider-inputs';
const MAX_PROVIDER_INPUT_BYTES = 100 * 1024 * 1024;
const PROVIDER_INPUT_RELAY_BASE_URL = 'https://api.veilstudio.io/api/provider-input';
const PROVIDER_INPUT_RELAY_TTL_SECONDS = 45 * 60;

function userInputPrefix(clerkUserId) {
    return crypto.createHash('sha256').update(String(clerkUserId)).digest('hex').slice(0, 24);
}

function safeFileName(value = 'reference.bin') {
    const cleaned = String(value)
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(-120);
    return cleaned || 'reference.bin';
}

function assertOwnedInputPath(clerkUserId, objectPath) {
    const normalized = String(objectPath || '').replace(/^\/+/, '');
    const expectedPrefix = `${userInputPrefix(clerkUserId)}/`;
    if (!normalized.startsWith(expectedPrefix) || normalized.includes('..')) {
        throw new Error('Invalid provider input path');
    }
    return normalized;
}

function validateUploadDescriptor(descriptor) {
    const size = Number(descriptor?.size);
    const mimeType = String(descriptor?.mimeType || '').toLowerCase();
    const category = String(descriptor?.category || '');
    const fileName = safeFileName(descriptor?.fileName);
    if (!['image', 'video', 'audio', 'file'].includes(category)) {
        throw new Error('Invalid provider input category');
    }
    const categoryLimit = category === 'image'
        ? 20 * 1024 * 1024
        : category === 'audio'
            ? 15 * 1024 * 1024
            : MAX_PROVIDER_INPUT_BYTES;
    if (!Number.isFinite(size) || size <= 0 || size > categoryLimit) {
        throw new Error('Provider inputs must be between 1 byte and 100MB');
    }
    if (category === 'image' && !/^image\/(?:jpeg|png|bmp|webp)$/.test(mimeType) && !/\.(?:jpe?g|png|bmp|webp)$/i.test(fileName)) {
        throw new Error('Wan 3.0 images must be JPG, PNG, BMP, or WEBP');
    }
    if (category === 'video' && !/^video\/(?:mp4|quicktime)$/.test(mimeType) && !/\.(?:mp4|mov)$/i.test(fileName)) {
        throw new Error('Wan 3.0 videos must be MP4 or MOV');
    }
    if (category === 'audio' && !/^audio\/(?:mpeg|mp3|wav|x-wav)$/.test(mimeType) && !/\.(?:mp3|wav)$/i.test(fileName)) {
        throw new Error('Wan 3.0 audio must be MP3 or WAV');
    }
    const normalizedMimeType = mimeType && mimeType !== 'application/octet-stream'
        ? mimeType
        : category === 'image'
            ? /\.png$/i.test(fileName) ? 'image/png' : /\.webp$/i.test(fileName) ? 'image/webp' : /\.bmp$/i.test(fileName) ? 'image/bmp' : 'image/jpeg'
            : category === 'video'
                ? /\.mov$/i.test(fileName) ? 'video/quicktime' : 'video/mp4'
                : category === 'audio'
                    ? /\.wav$/i.test(fileName) ? 'audio/wav' : 'audio/mpeg'
                    : 'application/octet-stream';
    return {
        category,
        size,
        mimeType: normalizedMimeType,
        fileName
    };
}

async function createProviderInputUploads(clerkUserId, generationId, descriptors) {
    if (!Array.isArray(descriptors) || descriptors.length === 0 || descriptors.length > 21) {
        throw new Error('Wan 3.0 accepts between 1 and 21 uploaded inputs');
    }
    const supabase = getSupabaseClient();
    const prefix = userInputPrefix(clerkUserId);

    return Promise.all(descriptors.map(async (rawDescriptor, index) => {
        const descriptor = validateUploadDescriptor(rawDescriptor);
        const objectPath = `${prefix}/${generationId}/${index}-${crypto.randomBytes(6).toString('hex')}-${descriptor.fileName}`;
        const { data, error } = await supabase.storage
            .from(PROVIDER_INPUT_BUCKET)
            .createSignedUploadUrl(objectPath);
        if (error || !data?.signedUrl) {
            throw new Error(`Could not prepare direct upload: ${error?.message || 'missing signed URL'}`);
        }
        return {
            objectPath,
            signedUrl: data.signedUrl,
            mimeType: descriptor.mimeType,
            size: descriptor.size,
            category: descriptor.category,
            fileName: descriptor.fileName
        };
    }));
}

function createProviderInputRelayUrl(clerkUserId, input, options = {}) {
    const objectPath = assertOwnedInputPath(clerkUserId, input?.objectPath);
    const token = Buffer.from(objectPath, 'utf8').toString('base64url');
    return createProviderMediaUrl(token, {
        baseUrl: options.baseUrl || process.env.PROVIDER_INPUT_RELAY_BASE_URL || PROVIDER_INPUT_RELAY_BASE_URL,
        ttlSeconds: options.ttlSeconds || PROVIDER_INPUT_RELAY_TTL_SECONDS,
        signingSecret: options.signingSecret,
        nowMs: options.nowMs
    });
}

async function deleteProviderInputs(clerkUserId, objectPaths) {
    const ownedPaths = [...new Set((objectPaths || []).map(path => assertOwnedInputPath(clerkUserId, path)))];
    if (ownedPaths.length === 0) return;
    const { error } = await getSupabaseClient().storage.from(PROVIDER_INPUT_BUCKET).remove(ownedPaths);
    if (error) console.warn('Could not clean up provider inputs:', error.message);
}

module.exports = {
    MAX_PROVIDER_INPUT_BYTES,
    PROVIDER_INPUT_BUCKET,
    assertOwnedInputPath,
    createProviderInputRelayUrl,
    createProviderInputUploads,
    deleteProviderInputs,
    safeFileName,
    userInputPrefix,
    validateUploadDescriptor
};

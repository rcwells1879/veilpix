const crypto = require('crypto');
const { getSupabaseClient } = require('./database');

const PROVIDER_INPUT_BUCKET = 'provider-inputs';
const KIE_FILE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-url-upload';
const MAX_PROVIDER_INPUT_BYTES = 100 * 1024 * 1024;

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

async function copyProviderInputToKie(clerkUserId, input) {
    const objectPath = assertOwnedInputPath(clerkUserId, input?.objectPath);
    const fileName = safeFileName(input?.fileName || objectPath.split('/').pop());
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
        .from(PROVIDER_INPUT_BUCKET)
        .createSignedUrl(objectPath, 10 * 60);
    if (error || !data?.signedUrl) {
        throw new Error(`Could not read the uploaded reference: ${error?.message || 'missing signed URL'}`);
    }

    const response = await fetch(KIE_FILE_UPLOAD_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.SEEDREAM_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fileUrl: data.signedUrl,
            uploadPath: `veilpix/wan3/${userInputPrefix(clerkUserId)}`,
            fileName
        }),
        signal: AbortSignal.timeout(45_000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success || !result?.data?.downloadUrl) {
        throw new Error(`Kie could not retrieve the reference (${response.status}): ${result?.msg || 'upload failed'}`);
    }
    return result.data.downloadUrl;
}

async function deleteProviderInputs(clerkUserId, objectPaths) {
    const ownedPaths = [...new Set((objectPaths || []).map(path => assertOwnedInputPath(clerkUserId, path)))];
    if (ownedPaths.length === 0) return;
    const { error } = await getSupabaseClient().storage.from(PROVIDER_INPUT_BUCKET).remove(ownedPaths);
    if (error) console.warn('Could not clean up provider inputs:', error.message);
}

module.exports = {
    KIE_FILE_UPLOAD_URL,
    MAX_PROVIDER_INPUT_BYTES,
    PROVIDER_INPUT_BUCKET,
    assertOwnedInputPath,
    copyProviderInputToKie,
    createProviderInputUploads,
    deleteProviderInputs,
    safeFileName,
    userInputPrefix,
    validateUploadDescriptor
};

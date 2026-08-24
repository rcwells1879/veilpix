const { normalizeGenerationId, getGenerationId } = require('./videoGenerationJob');

const IMAGE_GENERATION_REQUEST_TYPES = [
    'retouch',
    'filter',
    'adjust',
    'combine',
    'text-to-image',
    'z-image text-to-image',
    'edited image',
    'filtered image',
    'adjusted image',
    'combined image'
];

function firstImageUrl(value, depth = 0) {
    if (depth > 5 || value == null) return null;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return firstImageUrl(JSON.parse(trimmed), depth + 1);
            } catch {
                return null;
            }
        }
        return null;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const url = firstImageUrl(item, depth + 1);
            if (url) return url;
        }
        return null;
    }

    if (typeof value !== 'object') return null;

    const preferredKeys = ['resultUrls', 'imageUrl', 'image_url', 'url', 'images', 'resultJson', 'data'];
    for (const key of preferredKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
            const url = firstImageUrl(value[key], depth + 1);
            if (url) return url;
        }
    }

    return null;
}

function serializeImageGenerationResult(providerResult, creditsUsed) {
    const imageUrl = firstImageUrl(providerResult);
    if (!imageUrl) return null;
    return JSON.stringify({
        imageUrl,
        creditsUsed: Number.isFinite(Number(creditsUsed)) ? Number(creditsUsed) : undefined
    });
}

function imageGenerationJobResponse(record) {
    if (!record) return { status: 'pending' };

    if (!record.success) {
        return {
            status: 'failed',
            message: record.error_message && record.error_message !== 'pending'
                ? record.error_message
                : 'The image generation did not complete.'
        };
    }

    try {
        const result = JSON.parse(record.error_message || '{}');
        if (typeof result.deliveryId === 'string') {
            return {
                status: 'pending',
                deliveryId: result.deliveryId,
                creditsUsed: Number.isFinite(Number(result.creditsUsed)) ? Number(result.creditsUsed) : undefined,
                processingTime: record.processing_time_ms || undefined
            };
        }
        if (typeof result.imageUrl !== 'string' || !/^https?:\/\//i.test(result.imageUrl)) {
            throw new Error('Missing image URL');
        }
        return {
            status: 'succeeded',
            imageUrl: result.imageUrl,
            creditsUsed: Number.isFinite(Number(result.creditsUsed)) ? Number(result.creditsUsed) : undefined,
            processingTime: record.processing_time_ms || undefined
        };
    } catch {
        return {
            status: 'failed',
            message: 'The image finished, but its recovery information was unavailable.'
        };
    }
}

module.exports = {
    IMAGE_GENERATION_REQUEST_TYPES,
    normalizeGenerationId,
    getGenerationId,
    firstImageUrl,
    serializeImageGenerationResult,
    imageGenerationJobResponse
};

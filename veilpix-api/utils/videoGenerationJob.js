const VIDEO_GENERATION_REQUEST_TYPES = [
    'video',
    'reference-to-video',
    'text-to-video',
    'seedance-video',
    'wan3-video'
];

const GENERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeVideoGenerationId(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return GENERATION_ID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function getVideoGenerationId(req) {
    return normalizeVideoGenerationId(req.get('X-Generation-ID'));
}

const normalizeGenerationId = normalizeVideoGenerationId;
const getGenerationId = getVideoGenerationId;

function serializeVideoGenerationResult(videoUrl, creditsUsed) {
    return JSON.stringify({
        videoUrl,
        creditsUsed: Number.isFinite(Number(creditsUsed)) ? Number(creditsUsed) : undefined
    });
}

function videoGenerationJobResponse(record) {
    if (!record) return { status: 'pending' };

    if (!record.success) {
        return {
            status: 'failed',
            message: record.error_message && record.error_message !== 'pending'
                ? record.error_message
                : 'The video generation did not complete.'
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
        // The delivery acknowledgement deliberately scrubs the temporary
        // provider URL and delivery ID from the usage log. A recovery poll can
        // race that acknowledgement by a few milliseconds; keep it neutral
        // while the browser clears its already-verified local pending job.
        if (result.delivered === true) {
            return { status: 'pending', delivered: true };
        }
        if (typeof result.videoUrl !== 'string' || !/^https?:\/\//i.test(result.videoUrl)) {
            throw new Error('Missing video URL');
        }
        return {
            status: 'succeeded',
            videoUrl: result.videoUrl,
            creditsUsed: Number.isFinite(Number(result.creditsUsed)) ? Number(result.creditsUsed) : undefined,
            processingTime: record.processing_time_ms || undefined
        };
    } catch {
        return {
            status: 'failed',
            message: 'The video finished, but its recovery information was unavailable.'
        };
    }
}

module.exports = {
    VIDEO_GENERATION_REQUEST_TYPES,
    normalizeGenerationId,
    getGenerationId,
    normalizeVideoGenerationId,
    getVideoGenerationId,
    serializeVideoGenerationResult,
    videoGenerationJobResponse
};

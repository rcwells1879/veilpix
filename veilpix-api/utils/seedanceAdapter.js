/**
 * Seedance Video API Adapter
 *
 * Transforms VeilPix video generation requests into Kie.ai Seedance 2.x
 * requests and centralizes Seedance pricing.
 */

const {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    KIE_CREDIT_USD,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
} = require('./creditEconomics');
const SEEDANCE_MEDIA_DURATION_TOLERANCE_SECONDS = 0.25;

const SEEDANCE_MODELS = {
    v2_5: 'bytedance/seedance-2-5',
    regular: 'bytedance/seedance-2',
    fast: 'bytedance/seedance-2-fast',
    mini: 'bytedance/seedance-2-mini'
};

// Verified against Kie's live pricing table on 2026-08-29.
const SEEDANCE_PRICING = {
    v2_5: {
        '480p': { noVideo: 28, withVideo: 17 },
        '720p': { noVideo: 63, withVideo: 38 },
        '1080p': { noVideo: 114, withVideo: 68.5 }
    },
    fast: {
        '480p': { noVideo: 11.7, withVideo: 6.8 },
        '720p': { noVideo: 24.8, withVideo: 15 }
    },
    mini: {
        '480p': { noVideo: 3.8, withVideo: 2.4 },
        '720p': { noVideo: 8.2, withVideo: 5 }
    },
    regular: {
        '480p': { noVideo: 19, withVideo: 11.5 },
        '720p': { noVideo: 41, withVideo: 25 },
        '1080p': { noVideo: 102, withVideo: 62 }
    }
};

const ASPECT_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];

const SEEDANCE_DURATION_LIMITS = {
    v2_5: { min: 4, max: 30, defaultValue: 5 },
    regular: { min: 4, max: 15, defaultValue: 5 },
    fast: { min: 4, max: 15, defaultValue: 5 },
    mini: { min: 4, max: 15, defaultValue: 5 }
};

const SEEDANCE_REFERENCE_LIMITS = {
    v2_5: { images: 30, videos: 10, audios: 10, mediaSeconds: 30, imageBytes: 30 * 1024 * 1024, videoBytes: 200 * 1024 * 1024, audioBytes: 15 * 1024 * 1024 },
    regular: { images: 9, videos: 1, audios: 1, mediaSeconds: 15, imageBytes: 30 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, audioBytes: 15 * 1024 * 1024 },
    fast: { images: 9, videos: 1, audios: 1, mediaSeconds: 15, imageBytes: 30 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, audioBytes: 15 * 1024 * 1024 },
    mini: { images: 9, videos: 1, audios: 1, mediaSeconds: 15, imageBytes: 30 * 1024 * 1024, videoBytes: 50 * 1024 * 1024, audioBytes: 15 * 1024 * 1024 }
};

function normalizeVariant(variant) {
    return ['v2_5', 'regular', 'fast', 'mini'].includes(variant) ? variant : 'regular';
}

function normalizeResolution(variant, resolution) {
    const selectedVariant = normalizeVariant(variant);
    const allowed = Object.keys(SEEDANCE_PRICING[selectedVariant]);
    return allowed.includes(resolution) ? resolution : allowed[allowed.length - 1];
}

function clampDuration(duration, variant = 'regular') {
    const selectedVariant = normalizeVariant(variant);
    const limits = SEEDANCE_DURATION_LIMITS[selectedVariant];
    const parsed = Number.parseInt(duration, 10);
    if (Number.isNaN(parsed)) return limits.defaultValue;
    if (selectedVariant === 'v2_5' && parsed === -1) return -1;
    return Math.max(limits.min, Math.min(limits.max, parsed));
}

function normalizeAspectRatio(aspectRatio, variant = 'regular') {
    return ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : normalizeVariant(variant) === 'v2_5' ? 'adaptive' : '16:9';
}

function normalizeOutputFormat(outputFormat) {
    return ['mp4', 'mov'].includes(outputFormat) ? outputFormat : 'mp4';
}

function getSeedanceReferenceLimits(variant = 'regular') {
    return SEEDANCE_REFERENCE_LIMITS[normalizeVariant(variant)];
}

function exceedsSeedanceMediaDurationLimit(duration, limitSeconds) {
    const measuredDuration = Number(duration);
    return Number.isFinite(measuredDuration)
        && measuredDuration > Number(limitSeconds) + SEEDANCE_MEDIA_DURATION_TOLERANCE_SECONDS;
}

function estimateSeedanceKieCredits({
    variant = 'regular',
    resolution = '720p',
    duration = 5,
    hasVideoReference = false,
    referenceVideoDuration = 0
}) {
    const selectedVariant = normalizeVariant(variant);
    const selectedResolution = normalizeResolution(selectedVariant, resolution);
    const normalizedDuration = clampDuration(duration, selectedVariant);
    const selectedDuration = normalizedDuration === -1
        ? SEEDANCE_DURATION_LIMITS[selectedVariant].max
        : normalizedDuration;
    const pricing = SEEDANCE_PRICING[selectedVariant][selectedResolution];
    const inputDurationLimit = SEEDANCE_DURATION_LIMITS[selectedVariant].max;
    const billableSeconds = hasVideoReference
        ? selectedDuration + Math.max(0, Math.min(inputDurationLimit, Number(referenceVideoDuration) || 0))
        : selectedDuration;
    const rate = hasVideoReference ? pricing.withVideo : pricing.noVideo;

    return rate * billableSeconds;
}

function estimateSeedanceVeilPixCredits(options) {
    return veilpixCreditsFromKieCredits(estimateSeedanceKieCredits(options));
}

function resolveSeedanceInputMode(requestedMode, {
    hasFirstFrame = false,
    hasLastFrame = false,
    hasMultimodalReferences = false
} = {}) {
    if (requestedMode && !['frames', 'references'].includes(requestedMode)) {
        throw new Error('Invalid Seedance input mode');
    }

    const hasFrameInput = hasFirstFrame || hasLastFrame;
    const resolvedMode = requestedMode || (hasFrameInput ? 'frames' : 'references');

    if (resolvedMode === 'frames' && !hasFirstFrame) {
        throw new Error('Seedance start/end-frame mode requires a start frame');
    }
    if (resolvedMode === 'references' && hasFrameInput) {
        throw new Error('Seedance frame files were attached while style and character mode was selected');
    }
    if (hasFrameInput && hasMultimodalReferences) {
        throw new Error('Seedance frame inputs cannot be combined with multimodal references');
    }

    return resolvedMode;
}

function buildSeedanceRequest(prompt, options = {}) {
    const {
        variant = 'regular',
        duration = 5,
        resolution = '720p',
        aspectRatio = '16:9',
        referenceImages = [],
        referenceVideos = [],
        referenceAudios = [],
        firstFrameUrl,
        lastFrameUrl,
        generateAudio = false,
        webSearch = false,
        returnLastFrame = false,
        outputFormat = 'mp4',
        nsfwFilterEnabled = true
    } = options;

    const selectedVariant = normalizeVariant(variant);
    const referenceLimits = getSeedanceReferenceLimits(selectedVariant);
    const hasFrameInput = Boolean(firstFrameUrl || lastFrameUrl);
    const hasMultimodalInput = referenceImages.length > 0 || referenceVideos.length > 0 || referenceAudios.length > 0;

    if (lastFrameUrl && !firstFrameUrl) {
        throw new Error('A Seedance last frame requires a first frame');
    }
    if (hasFrameInput && hasMultimodalInput) {
        throw new Error('Seedance frame inputs cannot be combined with multimodal references');
    }
    if (referenceImages.length > referenceLimits.images) {
        throw new Error(`Seedance ${selectedVariant} supports up to ${referenceLimits.images} reference images`);
    }
    if (referenceVideos.length > referenceLimits.videos) {
        throw new Error(`Seedance ${selectedVariant} supports up to ${referenceLimits.videos} reference videos`);
    }
    if (referenceAudios.length > referenceLimits.audios) {
        throw new Error(`Seedance ${selectedVariant} supports up to ${referenceLimits.audios} reference audio files`);
    }

    const request = {
        prompt,
        duration: clampDuration(duration, selectedVariant),
        resolution: normalizeResolution(selectedVariant, resolution),
        aspect_ratio: normalizeAspectRatio(aspectRatio, selectedVariant),
        generate_audio: Boolean(generateAudio),
        web_search: Boolean(webSearch),
        nsfw_checker: Boolean(nsfwFilterEnabled)
    };

    if (selectedVariant === 'v2_5') {
        request.return_last_frame = Boolean(returnLastFrame);
        request.output_format = normalizeOutputFormat(outputFormat);
    }

    if (firstFrameUrl) {
        request.first_frame_url = firstFrameUrl;
    }
    if (lastFrameUrl) {
        request.last_frame_url = lastFrameUrl;
    }
    if (referenceImages.length > 0) {
        request.reference_image_urls = referenceImages;
    }
    if (referenceVideos.length > 0) {
        request.reference_video_urls = referenceVideos;
    }
    if (referenceAudios.length > 0) {
        request.reference_audio_urls = referenceAudios;
    }

    return {
        model: SEEDANCE_MODELS[selectedVariant],
        input: request
    };
}

function normalizeSeedanceResponse(resultJson) {
    try {
        if (!resultJson) {
            throw new Error('Empty Seedance response');
        }

        if (Array.isArray(resultJson.resultUrls) && resultJson.resultUrls.length > 0) {
            const videoUrl = resultJson.resultUrls.find(url => /\.(?:mp4|mov)(?:$|[?#])/i.test(url)) || resultJson.resultUrls[0];
            const lastFrameUrl = resultJson.lastFrameUrl || resultJson.last_frame_url
                || resultJson.resultUrls.find(url => url !== videoUrl && /\.(?:png|jpe?g|webp)(?:$|[?#])/i.test(url));
            return { success: true, videoUrl, lastFrameUrl };
        }

        if (resultJson.videoUrl) {
            return { success: true, videoUrl: resultJson.videoUrl, lastFrameUrl: resultJson.lastFrameUrl || resultJson.last_frame_url };
        }

        if (resultJson.url) {
            return { success: true, videoUrl: resultJson.url };
        }

        throw new Error('Seedance response missing video URL');
    } catch (error) {
        console.error('Failed to normalize Seedance response:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    ASPECT_RATIOS,
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    KIE_CREDIT_USD,
    SEEDANCE_MEDIA_DURATION_TOLERANCE_SECONDS,
    SEEDANCE_MODELS,
    SEEDANCE_PRICING,
    SEEDANCE_DURATION_LIMITS,
    SEEDANCE_REFERENCE_LIMITS,
    buildSeedanceRequest,
    clampDuration,
    estimateSeedanceKieCredits,
    estimateSeedanceVeilPixCredits,
    exceedsSeedanceMediaDurationLimit,
    normalizeAspectRatio,
    normalizeOutputFormat,
    normalizeResolution,
    normalizeSeedanceResponse,
    normalizeVariant,
    getSeedanceReferenceLimits,
    resolveSeedanceInputMode,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
};

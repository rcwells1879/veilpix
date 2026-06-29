/**
 * Seedance 2.0 Video API Adapter
 *
 * Transforms VeilPix video generation requests into Kie.ai Seedance 2.0
 * requests and centralizes Seedance pricing.
 */

const VEILPIX_CREDIT_USD = 6.99 / 100;
const TARGET_MARGIN = 0.12;
const BILLABLE_USD_PER_VEILPIX_CREDIT = VEILPIX_CREDIT_USD * (1 - TARGET_MARGIN);
const KIE_CREDIT_USD = 0.005;

const SEEDANCE_MODELS = {
    regular: 'bytedance/seedance-2',
    fast: 'bytedance/seedance-2-fast',
    mini: 'bytedance/seedance-2-mini'
};

const SEEDANCE_PRICING = {
    fast: {
        '480p': { noVideo: 15.5, withVideo: 9 },
        '720p': { noVideo: 33, withVideo: 20 }
    },
    mini: {
        '480p': { noVideo: 9.5, withVideo: 6 },
        '720p': { noVideo: 20.5, withVideo: 12.5 }
    },
    regular: {
        '480p': { noVideo: 19, withVideo: 11.5 },
        '720p': { noVideo: 41, withVideo: 25 },
        '1080p': { noVideo: 102, withVideo: 62 }
    }
};

const ASPECT_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];

const SEEDANCE_DURATION_LIMITS = {
    regular: { min: 4, max: 15, defaultValue: 5 },
    fast: { min: 4, max: 15, defaultValue: 5 },
    mini: { min: 4, max: 15, defaultValue: 5 }
};

function normalizeVariant(variant) {
    return ['regular', 'fast', 'mini'].includes(variant) ? variant : 'regular';
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
    return Math.max(limits.min, Math.min(limits.max, parsed));
}

function normalizeAspectRatio(aspectRatio) {
    return ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : '16:9';
}

function veilpixCreditsFromUsd(usdCost) {
    return Math.max(1, Math.ceil(usdCost / BILLABLE_USD_PER_VEILPIX_CREDIT));
}

function veilpixCreditsFromKieCredits(kieCredits) {
    return veilpixCreditsFromUsd(Number(kieCredits || 0) * KIE_CREDIT_USD);
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
    const selectedDuration = clampDuration(duration, selectedVariant);
    const pricing = SEEDANCE_PRICING[selectedVariant][selectedResolution];
    const inputDurationLimit = SEEDANCE_DURATION_LIMITS[selectedVariant].max;
    const billableSeconds = hasVideoReference
        ? selectedDuration + Math.max(0, Math.min(inputDurationLimit, Number(referenceVideoDuration) || 0))
        : selectedDuration;
    const rate = hasVideoReference ? pricing.withVideo : pricing.noVideo;

    return Math.ceil(rate * billableSeconds);
}

function estimateSeedanceVeilPixCredits(options) {
    return veilpixCreditsFromKieCredits(estimateSeedanceKieCredits(options));
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
        nsfwFilterEnabled = true
    } = options;

    const selectedVariant = normalizeVariant(variant);
    const request = {
        prompt,
        duration: clampDuration(duration, selectedVariant),
        resolution: normalizeResolution(selectedVariant, resolution),
        aspect_ratio: normalizeAspectRatio(aspectRatio),
        generate_audio: Boolean(generateAudio),
        web_search: Boolean(webSearch),
        nsfw_checker: Boolean(nsfwFilterEnabled)
    };

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
            return { success: true, videoUrl: resultJson.resultUrls[0] };
        }

        if (resultJson.videoUrl) {
            return { success: true, videoUrl: resultJson.videoUrl };
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
    SEEDANCE_MODELS,
    SEEDANCE_PRICING,
    SEEDANCE_DURATION_LIMITS,
    buildSeedanceRequest,
    clampDuration,
    estimateSeedanceKieCredits,
    estimateSeedanceVeilPixCredits,
    normalizeAspectRatio,
    normalizeResolution,
    normalizeSeedanceResponse,
    normalizeVariant,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
};

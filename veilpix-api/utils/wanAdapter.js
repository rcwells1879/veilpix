/**
 * Wan Video API Adapter
 *
 * Image-to-Video: Wan 2.6 Flash (wan/2-6-flash-image-to-video)
 * Text-to-Video:  Wan 2.6 (wan/2-6-text-to-video)
 * Reference-to-Video: Wan 2.7 (wan/2-7-r2v)
 *
 * Transforms VeilPix requests into Kie.ai API format
 * and normalizes responses for the frontend video player.
 */

const { veilpixCreditsFromKieCredits } = require('./creditEconomics');

// Kie pricing verified on 2026-08-29. Wan 2.6 uses fixed duration tiers;
// Wan 2.7 reference-to-video is billed per generated second.
const WAN_VIDEO_KIE_PRICING = {
    standard: {
        5: { '720p': 70, '1080p': 104.5 },
        10: { '720p': 140, '1080p': 209.5 },
        15: { '720p': 210, '1080p': 315 }
    },
    referencePerSecond: { '720p': 16, '1080p': 24 }
};

function estimateWanKieCredits({ duration = 5, resolution = '1080p', usesReferenceToVideo = false } = {}) {
    const selectedDuration = Math.max(1, Number(duration) || 5);
    const selectedResolution = resolution === '720p' ? '720p' : '1080p';
    if (usesReferenceToVideo) {
        return WAN_VIDEO_KIE_PRICING.referencePerSecond[selectedResolution] * selectedDuration;
    }
    return WAN_VIDEO_KIE_PRICING.standard[selectedDuration]?.[selectedResolution]
        || WAN_VIDEO_KIE_PRICING.standard[15][selectedResolution] * (selectedDuration / 15);
}

function estimateWanVeilPixCredits(options) {
    return veilpixCreditsFromKieCredits(estimateWanKieCredits(options));
}

/**
 * Snap a duration value to the nearest valid duration string.
 * Wan 2.6 Flash accepts '5', '10', or '15'.
 */
function snapDuration(duration) {
    const d = parseInt(duration);
    if (d <= 7) return '5';
    if (d <= 12) return '10';
    return '15';
}

/**
 * Build Wan 2.6 Flash image-to-video request body
 *
 * @param {string} imageUrl - Public URL of the reference image
 * @param {string} prompt - Motion/action description (max 1500 chars)
 * @param {object} options - Optional parameters
 * @param {number} options.duration - Video duration in seconds (snapped to 5/10/15)
 * @param {string} options.resolution - '720p' or '1080p' (default '1080p')
 * @param {boolean} options.nsfwFilterEnabled - NSFW filter (default true)
 * @param {boolean} options.audio - Enable audio generation (default true, required by Flash API)
 * @param {boolean} options.multiShots - Enable multi-shot mode (default false)
 * @returns {object} Wan API input parameters (nested inside model payload by caller)
 */
function buildImageToVideoRequest(imageUrl, prompt, options = {}) {
    const {
        duration = 5,
        resolution = '1080p',
        nsfwFilterEnabled = true,
        audio = true,
        multiShots = false
    } = options;

    return {
        prompt,
        image_urls: [imageUrl],
        resolution,
        duration: snapDuration(duration),
        audio,
        multi_shots: multiShots,
        nsfw_checker: nsfwFilterEnabled
    };
}

/**
 * Normalize Wan 2.7 API response
 *
 * @param {object} wanResponse - Parsed resultJson from polling
 * @returns {object} Normalized response with videoUrl
 */
function normalizeVideoResponse(wanResponse) {
    try {
        if (!wanResponse) {
            throw new Error('Empty Wan response');
        }

        // Kie.ai returns resultUrls array
        if (wanResponse.resultUrls && Array.isArray(wanResponse.resultUrls) && wanResponse.resultUrls.length > 0) {
            return {
                success: true,
                videoUrl: wanResponse.resultUrls[0]
            };
        }

        throw new Error('Wan response missing resultUrls array');
    } catch (error) {
        console.error('❌ Failed to normalize Wan response:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Build Wan 2.6 text-to-video request body
 *
 * @param {string} prompt - Video description (max 5000 chars)
 * @param {object} options - Optional parameters
 * @param {number} options.duration - Video duration in seconds (default 5)
 * @param {string} options.resolution - '720p' or '1080p' (default '1080p')
 * @param {boolean} options.multiShots - Enable multi-shot mode (default false)
 * @param {boolean} options.nsfwFilterEnabled - NSFW filter (default true)
 * @returns {object} Wan API input parameters
 */
function clampWan27Duration(duration) {
    const d = parseInt(duration);
    return Math.max(2, Math.min(10, isNaN(d) ? 5 : d));
}

function buildTextToVideoRequest(prompt, options = {}) {
    const {
        duration = 5,
        resolution = '1080p',
        multiShots = false,
        nsfwFilterEnabled = true
    } = options;

    return {
        prompt,
        resolution,
        duration: snapDuration(duration),
        multi_shots: multiShots,
        nsfw_checker: nsfwFilterEnabled
    };
}

/**
 * Build Wan 2.7 reference-to-video request body.
 * Kie docs allow reference_image and reference_video arrays together; at least one
 * is required and the combined count cannot exceed 5.
 */
function buildReferenceToVideoRequest(prompt, options = {}) {
    const {
        referenceImages = [],
        referenceVideos = [],
        duration = 5,
        resolution = '1080p',
        ratio = '16:9',
        nsfwFilterEnabled = true
    } = options;

    const request = {
        prompt,
        resolution,
        aspect_ratio: ratio,
        duration: clampWan27Duration(duration),
        prompt_extend: true,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled
    };

    if (referenceImages.length > 0) {
        request.reference_image = referenceImages;
    }
    if (referenceVideos.length > 0) {
        request.reference_video = referenceVideos;
    }

    return request;
}

module.exports = {
    WAN_VIDEO_KIE_PRICING,
    buildImageToVideoRequest,
    buildTextToVideoRequest,
    buildReferenceToVideoRequest,
    estimateWanKieCredits,
    estimateWanVeilPixCredits,
    normalizeVideoResponse
};

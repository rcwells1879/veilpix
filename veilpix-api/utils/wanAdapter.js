/**
 * Wan Video API Adapter
 *
 * Image-to-Video: Wan 2.6 Flash (wan/2-6-flash-image-to-video)
 * Text-to-Video:  Wan 2.7 (wan/2-7-text-to-video)
 *
 * Transforms VeilPix requests into Kie.ai API format
 * and normalizes responses for the frontend video player.
 */

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

    const request = {
        prompt,
        image_urls: [imageUrl],
        resolution,
        duration: snapDuration(duration),
        audio,
        nsfw_checker: nsfwFilterEnabled
    };

    // multi_shots is optional — only include when enabled
    if (multiShots) {
        request.multi_shots = true;
    }

    return request;
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
 * Build Wan 2.7 text-to-video request body
 *
 * @param {string} prompt - Video description (max 5000 chars)
 * @param {object} options - Optional parameters
 * @param {number} options.duration - Video duration in seconds (integer 2-15, default 5)
 * @param {string} options.resolution - '720p' or '1080p' (default '1080p')
 * @param {string} options.ratio - Aspect ratio (default '16:9')
 * @param {boolean} options.nsfwFilterEnabled - NSFW filter (default true)
 * @returns {object} Wan API input parameters
 */
function buildTextToVideoRequest(prompt, options = {}) {
    const {
        duration = 5,
        resolution = '1080p',
        ratio = '16:9',
        nsfwFilterEnabled = true
    } = options;

    // Wan 2.7 accepts integer duration (2-15), not string
    const d = parseInt(duration);
    const clampedDuration = Math.max(2, Math.min(15, isNaN(d) ? 5 : d));

    return {
        prompt,
        resolution,
        ratio,
        duration: clampedDuration,
        prompt_extend: true,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled
    };
}

module.exports = {
    buildImageToVideoRequest,
    buildTextToVideoRequest,
    normalizeVideoResponse
};

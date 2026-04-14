/**
 * Wan 2.6 Video API Adapter
 *
 * Transforms VeilPix requests into Wan 2.6 API format
 * and normalizes responses for the frontend video player
 */

/**
 * Snap a duration value to the nearest valid Wan 2.6 duration string.
 * Wan 2.6 only accepts '5', '10', or '15'.
 */
function snapDuration(duration) {
    const d = parseInt(duration);
    if (d <= 7) return '5';
    if (d <= 12) return '10';
    return '15';
}

/**
 * Build Wan 2.6 image-to-video request body
 *
 * @param {string} imageUrl - Public URL of the reference image
 * @param {string} prompt - Motion/action description (max 5000 chars)
 * @param {object} options - Optional parameters
 * @param {number} options.duration - Video duration in seconds (snapped to 5/10/15)
 * @param {string} options.resolution - '720p' or '1080p' (default '1080p')
 * @param {boolean} options.nsfwFilterEnabled - NSFW filter (default true)
 * @returns {object} Wan API input parameters (nested inside model payload by caller)
 */
function buildImageToVideoRequest(imageUrl, prompt, options = {}) {
    const {
        duration = 5,
        resolution = '1080p',
        nsfwFilterEnabled = true
    } = options;

    return {
        prompt,
        image_urls: [imageUrl],
        resolution,
        duration: snapDuration(duration),
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
 * @param {number} options.duration - Video duration in seconds (snapped to 5/10/15)
 * @param {string} options.resolution - '720p' or '1080p' (default '1080p')
 * @param {boolean} options.nsfwFilterEnabled - NSFW filter (default true)
 * @returns {object} Wan API input parameters
 */
function buildTextToVideoRequest(prompt, options = {}) {
    const {
        duration = 5,
        resolution = '1080p',
        nsfwFilterEnabled = true
    } = options;

    return {
        prompt,
        resolution,
        duration: snapDuration(duration),
        nsfw_checker: nsfwFilterEnabled
    };
}

module.exports = {
    buildImageToVideoRequest,
    buildTextToVideoRequest,
    normalizeVideoResponse
};

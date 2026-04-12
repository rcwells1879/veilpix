/**
 * Wan 2.7 Image-to-Video API Adapter
 *
 * Transforms VeilPix requests into Wan 2.7 API format
 * and normalizes responses for the frontend video player
 */

/**
 * Build Wan 2.7 image-to-video request body
 *
 * @param {string} firstFrameUrl - Public URL of the reference image (first frame)
 * @param {string} prompt - Motion/action description (max 5000 chars)
 * @param {object} options - Optional parameters
 * @param {number} options.duration - Video duration in seconds (2-15, default 5)
 * @param {string} options.resolution - '720p' or '1080p' (default '1080p')
 * @param {string} options.negativePrompt - What to avoid (max 500 chars)
 * @returns {object} Wan API input parameters (nested inside model payload by caller)
 */
function buildImageToVideoRequest(firstFrameUrl, prompt, options = {}) {
    const {
        duration = 5,
        resolution = '1080p',
        negativePrompt = null,
        nsfwFilterEnabled = true
    } = options;

    const request = {
        prompt,
        first_frame_url: firstFrameUrl,
        resolution,
        duration: Math.min(15, Math.max(2, parseInt(duration))),
        prompt_extend: true,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled
    };

    if (negativePrompt) {
        request.negative_prompt = negativePrompt;
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

module.exports = {
    buildImageToVideoRequest,
    normalizeVideoResponse
};

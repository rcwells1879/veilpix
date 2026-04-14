/**
 * Wan 2.7 Image API Adapter
 *
 * Transforms VeilPix requests into Wan 2.7 Image API format
 * and normalizes responses to match the unified response structure.
 *
 * Key differences from SeeDream:
 * - Field name is `input_urls` (not `image_urls`)
 * - Resolution maps directly ('1K' → '1K', not quality mapping)
 * - Includes `n: 1`, `watermark: false` in all requests
 * - Text-to-image request adds `thinking_mode: true`
 * - nsfw_checker defaults to false (more permissive)
 */

/**
 * Build Wan 2.7 Image API request for localized editing
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} prompt - The edit instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {number} x - X coordinate for localized edit (optional)
 * @param {number} y - Y coordinate for localized edit (optional)
 * @param {string} aspectRatio - Aspect ratio format (optional, defaults to '1:1')
 * @param {boolean} nsfwFilterEnabled - Whether to enable NSFW filter
 * @returns {object} Wan Image API request body
 */
function buildEditRequest(imageUrls, prompt, resolution, x = null, y = null, aspectRatio = '1:1', nsfwFilterEnabled = false) {
    const enhancedPrompt = x !== null && y !== null
        ? `${prompt}. Focus the edit on the area around coordinates (${x}, ${y}).`
        : prompt;

    return {
        prompt: enhancedPrompt,
        input_urls: imageUrls,
        aspect_ratio: aspectRatio,
        resolution: resolution || '2K',
        n: 1,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled
    };
}

/**
 * Build Wan 2.7 Image API request for filter application
 */
function buildFilterRequest(imageUrls, filterType, resolution, aspectRatio = '1:1', nsfwFilterEnabled = false) {
    return {
        prompt: `Apply the following style filter to the entire image: ${filterType}. Maintain the original composition and content, only change the style.`,
        input_urls: imageUrls,
        aspect_ratio: aspectRatio,
        resolution: resolution || '2K',
        n: 1,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled
    };
}

/**
 * Build Wan 2.7 Image API request for global adjustments
 */
function buildAdjustRequest(imageUrls, adjustmentPrompt, resolution, aspectRatio = '1:1', nsfwFilterEnabled = false) {
    return {
        prompt: `${adjustmentPrompt}. Apply this adjustment globally across the entire image while maintaining photorealism.`,
        input_urls: imageUrls,
        aspect_ratio: aspectRatio,
        resolution: resolution || '2K',
        n: 1,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled
    };
}

/**
 * Build Wan 2.7 Image API request for combining multiple images
 */
function buildCombineRequest(imageUrls, prompt, resolution, aspectRatio = '1:1', nsfwFilterEnabled = false) {
    return {
        prompt: `Combine these images into a single creative composition. ${prompt}. Create a seamless, natural-looking result.`,
        input_urls: imageUrls,
        aspect_ratio: aspectRatio,
        resolution: resolution || '2K',
        n: 1,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled
    };
}

/**
 * Build Wan 2.7 Image API request for text-to-image generation (no reference image)
 */
function buildTextToImageRequest(prompt, resolution, aspectRatio = '1:1', nsfwFilterEnabled = false) {
    return {
        prompt,
        aspect_ratio: aspectRatio,
        resolution: resolution || '2K',
        n: 1,
        watermark: false,
        nsfw_checker: nsfwFilterEnabled,
        thinking_mode: true
    };
}

/**
 * Normalize Wan Image API response to match unified response format
 */
function normalizeResponse(wanResponse) {
    try {
        if (!wanResponse) {
            throw new Error('Empty Wan Image response');
        }

        if (wanResponse.resultUrls && Array.isArray(wanResponse.resultUrls) && wanResponse.resultUrls.length > 0) {
            return {
                success: true,
                imageUrl: wanResponse.resultUrls[0],
                needsConversion: true
            };
        }

        if (wanResponse.images && Array.isArray(wanResponse.images) && wanResponse.images.length > 0) {
            const firstImage = wanResponse.images[0];
            if (firstImage.base64) {
                return {
                    success: true,
                    image: {
                        data: firstImage.base64,
                        mimeType: 'image/png'
                    }
                };
            }
            if (firstImage.url) {
                return {
                    success: true,
                    imageUrl: firstImage.url,
                    needsConversion: true
                };
            }
        }

        throw new Error('Wan Image response missing resultUrls or images array');
    } catch (error) {
        console.error('❌ Failed to normalize Wan Image response:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Fetch image from URL and convert to base64
 */
async function urlToBase64(imageUrl) {
    try {
        console.log(`📥 Fetching image from URL: ${imageUrl}`);

        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');

        const contentType = response.headers.get('content-type') || 'image/png';

        console.log(`✅ Image converted to base64 (${base64.length} chars)`);

        return {
            success: true,
            data: base64,
            mimeType: contentType
        };
    } catch (error) {
        console.error('❌ Failed to convert URL to base64:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    buildEditRequest,
    buildFilterRequest,
    buildAdjustRequest,
    buildCombineRequest,
    buildTextToImageRequest,
    normalizeResponse,
    urlToBase64
};

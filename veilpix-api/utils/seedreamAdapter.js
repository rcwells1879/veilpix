/**
 * SeeDream API Adapter
 *
 * Transforms VeilPix requests into SeeDream 4.5 Edit API format
 * and normalizes SeeDream responses to match Gemini response structure
 */

/**
 * Map resolution setting to SeeDream 4.5 quality parameter
 *
 * @param {string} resolution - '1K', '2K', or '4K'
 * @returns {string} SeeDream quality format ('basic' for 2K, 'high' for 4K)
 */
function mapQuality(resolution) {
    const qualityMap = {
        '1K': 'basic',  // 1K maps to basic (2K output)
        '2K': 'basic',
        '4K': 'high'
    };
    return qualityMap[resolution] || 'basic'; // Default to basic (2K)
}

/**
 * Map image aspect to SeeDream 4.5 aspect_ratio parameter
 * Based on the uploaded image dimensions or user preference
 *
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} SeeDream aspect_ratio format (e.g., '1:1', '16:9')
 */
function mapImageSize(width, height) {
    const ratio = width / height;

    if (Math.abs(ratio - 1) < 0.1) {
        return '1:1'; // Square
    } else if (ratio > 1.5) {
        return '16:9'; // Widescreen
    } else if (ratio < 0.7) {
        return '9:16'; // Vertical
    } else if (ratio > 1) {
        return '4:3'; // Standard landscape
    } else {
        return '3:4'; // Standard portrait
    }
}

/**
 * Map aspect ratio template filename to SeeDream 4.5 aspect_ratio parameter
 * Used when user selects aspect ratio from UI buttons
 *
 * @param {string} aspectRatioFile - Template filename (e.g., 'transparent-1-1.png')
 * @returns {string} SeeDream aspect_ratio format (e.g., '1:1', '16:9')
 */
function mapAspectRatioFileToSeedreamSize(aspectRatioFile) {
    const aspectRatioMap = {
        'transparent-1-1.png': '1:1',     // 1:1 Square
        'transparent-16-9.png': '16:9',   // 16:9 Widescreen
        'transparent-9-16.png': '9:16',   // 9:16 Vertical
        'transparent-4-3.png': '4:3',     // 4:3 Standard
        'transparent-3-4.png': '3:4'      // 3:4 Portrait
    };

    return aspectRatioMap[aspectRatioFile] || '1:1'; // Default to square
}

/**
 * Build SeeDream 4.5 Edit API request for localized editing
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} prompt - The edit instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {number} x - X coordinate for localized edit (optional)
 * @param {number} y - Y coordinate for localized edit (optional)
 * @param {string} aspectRatio - SeeDream aspect_ratio format (optional, defaults to '1:1')
 * @returns {object} SeeDream API request body
 */
function buildEditRequest(imageUrls, prompt, resolution, x = null, y = null, aspectRatio = '1:1') {
    const enhancedPrompt = x !== null && y !== null
        ? `${prompt}. Focus the edit on the area around coordinates (${x}, ${y}).`
        : prompt;

    return {
        prompt: enhancedPrompt,
        image_urls: imageUrls,
        aspect_ratio: aspectRatio,
        quality: mapQuality(resolution)
    };
}

/**
 * Build SeeDream 4.5 Edit API request for filter application
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} filterType - The filter description
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - SeeDream aspect_ratio format (optional, defaults to '1:1')
 * @returns {object} SeeDream API request body
 */
function buildFilterRequest(imageUrls, filterType, resolution, aspectRatio = '1:1') {
    return {
        prompt: `Apply the following style filter to the entire image: ${filterType}. Maintain the original composition and content, only change the style.`,
        image_urls: imageUrls,
        aspect_ratio: aspectRatio,
        quality: mapQuality(resolution)
    };
}

/**
 * Build SeeDream 4.5 Edit API request for global adjustments
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} adjustmentPrompt - The adjustment instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - SeeDream aspect_ratio format (optional, defaults to '1:1')
 * @returns {object} SeeDream API request body
 */
function buildAdjustRequest(imageUrls, adjustmentPrompt, resolution, aspectRatio = '1:1') {
    return {
        prompt: `${adjustmentPrompt}. Apply this adjustment globally across the entire image while maintaining photorealism.`,
        image_urls: imageUrls,
        aspect_ratio: aspectRatio,
        quality: mapQuality(resolution)
    };
}

/**
 * Build SeeDream 4.5 Edit API request for combining multiple images
 *
 * @param {string[]} imageUrls - Array of public image URLs (2-5 images)
 * @param {string} prompt - The combination instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - SeeDream aspect_ratio format (optional, defaults to '1:1')
 * @returns {object} SeeDream API request body
 */
function buildCombineRequest(imageUrls, prompt, resolution, aspectRatio = '1:1') {
    return {
        prompt: `Combine these images into a single creative composition. ${prompt}. Create a seamless, natural-looking result.`,
        image_urls: imageUrls,
        aspect_ratio: aspectRatio,
        quality: mapQuality(resolution)
    };
}

/**
 * Normalize SeeDream API response to match Gemini response format
 *
 * @param {object} seedreamResponse - The raw SeeDream API response
 * @returns {object} Normalized response matching Gemini format
 */
function normalizeResponse(seedreamResponse) {
    try {
        // Kie.ai SeeDream response structure:
        // {
        //   resultUrls: ["https://..."],
        //   job_id: "...",
        //   status: "completed"
        // }

        if (!seedreamResponse) {
            throw new Error('Empty SeeDream response');
        }

        // Check for resultUrls array (Kie.ai format)
        if (seedreamResponse.resultUrls && Array.isArray(seedreamResponse.resultUrls) && seedreamResponse.resultUrls.length > 0) {
            const imageUrl = seedreamResponse.resultUrls[0];
            return {
                success: true,
                imageUrl: imageUrl,
                needsConversion: true
            };
        }

        // Fallback: Check for images array (alternative format)
        if (seedreamResponse.images && Array.isArray(seedreamResponse.images) && seedreamResponse.images.length > 0) {
            const firstImage = seedreamResponse.images[0];

            // If response includes base64, use it directly
            if (firstImage.base64) {
                return {
                    success: true,
                    image: {
                        data: firstImage.base64,
                        mimeType: 'image/png'
                    }
                };
            }

            // If response includes URL, we need to fetch and convert to base64
            if (firstImage.url) {
                return {
                    success: true,
                    imageUrl: firstImage.url,
                    needsConversion: true
                };
            }
        }

        throw new Error('SeeDream response missing resultUrls or images array');

    } catch (error) {
        console.error('❌ Failed to normalize SeeDream response:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Fetch image from URL and convert to base64
 *
 * @param {string} imageUrl - Public image URL
 * @returns {Promise<{success: boolean, data?: string, mimeType?: string, error?: string}>}
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
    mapQuality,
    mapImageSize,
    mapAspectRatioFileToSeedreamSize,
    buildEditRequest,
    buildFilterRequest,
    buildAdjustRequest,
    buildCombineRequest,
    normalizeResponse,
    urlToBase64
};

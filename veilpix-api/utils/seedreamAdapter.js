/**
 * SeeDream API Adapter
 *
 * Transforms VeilPix requests into SeeDream 4.0 API format
 * and normalizes SeeDream responses to match Gemini response structure
 */

/**
 * Map resolution setting to SeeDream image_resolution parameter
 *
 * @param {string} resolution - '1K', '2K', or '4K'
 * @returns {string} SeeDream resolution format
 */
function mapResolution(resolution) {
    const resolutionMap = {
        '1K': '1K',
        '2K': '2K',
        '4K': '4K'
    };
    return resolutionMap[resolution] || '2K'; // Default to 2K
}

/**
 * Map image aspect to SeeDream image_size parameter
 * Based on the uploaded image dimensions or user preference
 *
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} SeeDream image_size format
 */
function mapImageSize(width, height) {
    const aspectRatio = width / height;

    if (Math.abs(aspectRatio - 1) < 0.1) {
        return 'square_hd'; // 1:1
    } else if (aspectRatio > 1.5) {
        return 'landscape_16_9'; // Widescreen
    } else if (aspectRatio < 0.7) {
        return 'portrait_9_16'; // Vertical
    } else if (aspectRatio > 1) {
        return 'landscape_4_3'; // Standard landscape
    } else {
        return 'portrait_3_4'; // Standard portrait
    }
}

/**
 * Build SeeDream API request for localized editing
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} prompt - The edit instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {number} x - X coordinate for localized edit (optional)
 * @param {number} y - Y coordinate for localized edit (optional)
 * @returns {object} SeeDream API request body
 */
function buildEditRequest(imageUrls, prompt, resolution, x = null, y = null) {
    const enhancedPrompt = x !== null && y !== null
        ? `${prompt}. Focus the edit on the area around coordinates (${x}, ${y}).`
        : prompt;

    return {
        prompt: enhancedPrompt,
        image_urls: imageUrls,
        image_size: 'square_hd', // Default to square HD, could be made dynamic
        image_resolution: mapResolution(resolution),
        max_images: 1 // Single output image
    };
}

/**
 * Build SeeDream API request for filter application
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} filterType - The filter description
 * @param {string} resolution - '1K', '2K', or '4K'
 * @returns {object} SeeDream API request body
 */
function buildFilterRequest(imageUrls, filterType, resolution) {
    return {
        prompt: `Apply the following style filter to the entire image: ${filterType}. Maintain the original composition and content, only change the style.`,
        image_urls: imageUrls,
        image_size: 'square_hd',
        image_resolution: mapResolution(resolution),
        max_images: 1
    };
}

/**
 * Build SeeDream API request for global adjustments
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} adjustmentPrompt - The adjustment instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @returns {object} SeeDream API request body
 */
function buildAdjustRequest(imageUrls, adjustmentPrompt, resolution) {
    return {
        prompt: `${adjustmentPrompt}. Apply this adjustment globally across the entire image while maintaining photorealism.`,
        image_urls: imageUrls,
        image_size: 'square_hd',
        image_resolution: mapResolution(resolution),
        max_images: 1
    };
}

/**
 * Build SeeDream API request for combining multiple images
 *
 * @param {string[]} imageUrls - Array of public image URLs (2-5 images)
 * @param {string} prompt - The combination instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @returns {object} SeeDream API request body
 */
function buildCombineRequest(imageUrls, prompt, resolution) {
    return {
        prompt: `Combine these images into a single creative composition. ${prompt}. Create a seamless, natural-looking result.`,
        image_urls: imageUrls,
        image_size: 'square_hd',
        image_resolution: mapResolution(resolution),
        max_images: 1
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
        // SeeDream response structure (based on typical image generation APIs):
        // {
        //   images: [{
        //     url: "https://...",
        //     base64: "...",  // if requested
        //   }],
        //   status: "success"
        // }

        if (!seedreamResponse || !seedreamResponse.images || seedreamResponse.images.length === 0) {
            throw new Error('No images in SeeDream response');
        }

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
            // Return the URL and let the route handler fetch and convert
            return {
                success: true,
                imageUrl: firstImage.url,
                needsConversion: true
            };
        }

        throw new Error('SeeDream response missing both base64 and url');

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
    mapResolution,
    mapImageSize,
    buildEditRequest,
    buildFilterRequest,
    buildAdjustRequest,
    buildCombineRequest,
    normalizeResponse,
    urlToBase64
};

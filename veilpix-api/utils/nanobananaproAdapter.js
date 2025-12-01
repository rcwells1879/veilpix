/**
 * Nano Banana Pro API Adapter
 *
 * Transforms VeilPix requests into Nano Banana Pro (Gemini 3 Pro Image) API format
 * and normalizes responses to match the standard VeilPix response structure.
 *
 * Uses the same Kie.ai infrastructure as SeeDream but with different parameters.
 */

/**
 * Map resolution setting to Nano Banana Pro resolution parameter
 *
 * @param {string} resolution - '1K', '2K', or '4K'
 * @returns {string} Nano Banana Pro resolution format
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
 * Map aspect ratio string to Nano Banana Pro format
 * Nano Banana Pro uses simple ratio strings like "1:1", "16:9", etc.
 *
 * @param {string} aspectRatio - Aspect ratio string (e.g., '1:1', '16:9')
 * @returns {string} Validated aspect ratio or default
 */
function mapAspectRatio(aspectRatio) {
    const validRatios = [
        '1:1', '2:3', '3:2', '3:4', '4:3',
        '4:5', '5:4', '9:16', '16:9', '21:9'
    ];

    if (validRatios.includes(aspectRatio)) {
        return aspectRatio;
    }

    return '1:1'; // Default to square
}

/**
 * Build Nano Banana Pro API request for localized editing
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} prompt - The edit instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {number} x - X coordinate for localized edit (optional)
 * @param {number} y - Y coordinate for localized edit (optional)
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana Pro API request body (input parameters)
 */
function buildEditRequest(imageUrls, prompt, resolution, x = null, y = null, aspectRatio = '1:1') {
    const enhancedPrompt = x !== null && y !== null
        ? `${prompt}. Focus the edit on the area around coordinates (${x}, ${y}).`
        : prompt;

    return {
        prompt: enhancedPrompt,
        image_input: imageUrls,
        aspect_ratio: mapAspectRatio(aspectRatio),
        resolution: mapResolution(resolution),
        output_format: 'png'
    };
}

/**
 * Build Nano Banana Pro API request for filter application
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} filterType - The filter description
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana Pro API request body (input parameters)
 */
function buildFilterRequest(imageUrls, filterType, resolution, aspectRatio = '1:1') {
    return {
        prompt: `Apply the following style filter to the entire image: ${filterType}. Maintain the original composition and content, only change the style.`,
        image_input: imageUrls,
        aspect_ratio: mapAspectRatio(aspectRatio),
        resolution: mapResolution(resolution),
        output_format: 'png'
    };
}

/**
 * Build Nano Banana Pro API request for global adjustments
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} adjustmentPrompt - The adjustment instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana Pro API request body (input parameters)
 */
function buildAdjustRequest(imageUrls, adjustmentPrompt, resolution, aspectRatio = '1:1') {
    return {
        prompt: `${adjustmentPrompt}. Apply this adjustment globally across the entire image while maintaining photorealism.`,
        image_input: imageUrls,
        aspect_ratio: mapAspectRatio(aspectRatio),
        resolution: mapResolution(resolution),
        output_format: 'png'
    };
}

/**
 * Build Nano Banana Pro API request for combining multiple images
 * Note: Nano Banana Pro supports up to 8 images per the API docs
 *
 * @param {string[]} imageUrls - Array of public image URLs (up to 8 images)
 * @param {string} prompt - The combination instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana Pro API request body (input parameters)
 */
function buildCombineRequest(imageUrls, prompt, resolution, aspectRatio = '1:1') {
    return {
        prompt: `Combine these images into a single creative composition. ${prompt}. Create a seamless, natural-looking result.`,
        image_input: imageUrls,
        aspect_ratio: mapAspectRatio(aspectRatio),
        resolution: mapResolution(resolution),
        output_format: 'png'
    };
}

/**
 * Normalize Nano Banana Pro API response to match standard VeilPix format
 *
 * @param {object} nanoBananaProResponse - The raw API response (parsed resultJson)
 * @returns {object} Normalized response
 */
function normalizeResponse(nanoBananaProResponse) {
    try {
        // Kie.ai Nano Banana Pro response structure (from resultJson):
        // {
        //   resultUrls: ["https://..."],
        // }

        if (!nanoBananaProResponse) {
            throw new Error('Empty Nano Banana Pro response');
        }

        // Check for resultUrls array (Kie.ai format)
        if (nanoBananaProResponse.resultUrls &&
            Array.isArray(nanoBananaProResponse.resultUrls) &&
            nanoBananaProResponse.resultUrls.length > 0) {
            const imageUrl = nanoBananaProResponse.resultUrls[0];
            return {
                success: true,
                imageUrl: imageUrl,
                needsConversion: true
            };
        }

        throw new Error('Nano Banana Pro response missing resultUrls array');

    } catch (error) {
        console.error('Failed to normalize Nano Banana Pro response:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Fetch image from URL and convert to base64
 * (Shared utility - same as SeeDream)
 *
 * @param {string} imageUrl - Public image URL
 * @returns {Promise<{success: boolean, data?: string, mimeType?: string, error?: string}>}
 */
async function urlToBase64(imageUrl) {
    try {
        console.log(`Fetching image from URL: ${imageUrl}`);

        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');

        const contentType = response.headers.get('content-type') || 'image/png';

        console.log(`Image converted to base64 (${base64.length} chars)`);

        return {
            success: true,
            data: base64,
            mimeType: contentType
        };

    } catch (error) {
        console.error('Failed to convert URL to base64:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    mapResolution,
    mapAspectRatio,
    buildEditRequest,
    buildFilterRequest,
    buildAdjustRequest,
    buildCombineRequest,
    normalizeResponse,
    urlToBase64
};

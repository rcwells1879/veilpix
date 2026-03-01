/**
 * Nano Banana 2 API Adapter
 *
 * Transforms VeilPix requests into Nano Banana 2 (Gemini 3.1 Flash) API format
 * and normalizes responses to match the standard VeilPix response structure.
 *
 * Uses the same Kie.ai infrastructure as SeeDream and Nano Banana Pro.
 * Supports 15 aspect ratios including ultra-wide/tall + auto.
 */

/**
 * Map resolution setting to Nano Banana 2 resolution parameter
 *
 * @param {string} resolution - '1K', '2K', or '4K'
 * @returns {string} Nano Banana 2 resolution format
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
 * Map aspect ratio string to Nano Banana 2 format
 * Nano Banana 2 supports 15 aspect ratios including ultra-wide/tall and auto.
 *
 * @param {string} aspectRatio - Aspect ratio string (e.g., '1:1', '16:9', 'auto')
 * @returns {string} Validated aspect ratio or default
 */
function mapAspectRatio(aspectRatio) {
    const validRatios = [
        '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3',
        '4:5', '5:4', '8:1', '9:16', '16:9', '21:9', 'auto'
    ];

    if (validRatios.includes(aspectRatio)) {
        return aspectRatio;
    }

    return '1:1'; // Default to square
}

/**
 * Build Nano Banana 2 API request for localized editing
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} prompt - The edit instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {number} x - X coordinate for localized edit (optional)
 * @param {number} y - Y coordinate for localized edit (optional)
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana 2 API request body (input parameters)
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
 * Build Nano Banana 2 API request for filter application
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} filterType - The filter description
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana 2 API request body (input parameters)
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
 * Build Nano Banana 2 API request for global adjustments
 *
 * @param {string[]} imageUrls - Array of public image URLs
 * @param {string} adjustmentPrompt - The adjustment instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana 2 API request body (input parameters)
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
 * Build Nano Banana 2 API request for combining multiple images
 * Nano Banana 2 supports up to 14 images per the API docs
 *
 * @param {string[]} imageUrls - Array of public image URLs (up to 14 images)
 * @param {string} prompt - The combination instruction
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana 2 API request body (input parameters)
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
 * Build Nano Banana 2 API request for text-to-image generation
 * No image_input — generates from prompt only
 *
 * @param {string} prompt - The image generation prompt
 * @param {string} resolution - '1K', '2K', or '4K'
 * @param {string} aspectRatio - Aspect ratio string (optional, defaults to '1:1')
 * @returns {object} Nano Banana 2 API request body (input parameters)
 */
function buildTextToImageRequest(prompt, resolution = '2K', aspectRatio = '1:1') {
    return {
        prompt: prompt,
        aspect_ratio: mapAspectRatio(aspectRatio),
        resolution: mapResolution(resolution),
        output_format: 'png'
    };
}

/**
 * Normalize Nano Banana 2 API response to match standard VeilPix format
 *
 * @param {object} nanoBanana2Response - The raw API response (parsed resultJson)
 * @returns {object} Normalized response
 */
function normalizeResponse(nanoBanana2Response) {
    try {
        // Kie.ai Nano Banana 2 response structure (from resultJson):
        // {
        //   resultUrls: ["https://..."],
        // }

        if (!nanoBanana2Response) {
            throw new Error('Empty Nano Banana 2 response');
        }

        // Check for resultUrls array (Kie.ai format)
        if (nanoBanana2Response.resultUrls &&
            Array.isArray(nanoBanana2Response.resultUrls) &&
            nanoBanana2Response.resultUrls.length > 0) {
            const imageUrl = nanoBanana2Response.resultUrls[0];
            return {
                success: true,
                imageUrl: imageUrl,
                needsConversion: true
            };
        }

        throw new Error('Nano Banana 2 response missing resultUrls array');

    } catch (error) {
        console.error('Failed to normalize Nano Banana 2 response:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Fetch image from URL and convert to base64
 * (Shared utility - same as SeeDream and Nano Banana Pro)
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
    buildTextToImageRequest,
    normalizeResponse,
    urlToBase64
};

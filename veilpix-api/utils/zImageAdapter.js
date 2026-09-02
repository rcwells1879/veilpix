const ZIMAGE_ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16'];

function isSupportedZImageAspectRatio(value) {
    return ZIMAGE_ASPECT_RATIOS.includes(value);
}

function buildTextToImageRequest(prompt, aspectRatio = '1:1', nsfwFilterEnabled = true) {
    if (!isSupportedZImageAspectRatio(aspectRatio)) {
        throw new Error(`Unsupported Z-Image aspect ratio: ${aspectRatio}`);
    }

    return {
        prompt,
        aspect_ratio: aspectRatio,
        nsfw_checker: nsfwFilterEnabled
    };
}

function normalizeResponse(response) {
    try {
        if (!response) {
            throw new Error('Empty Z-Image response');
        }

        if (Array.isArray(response.resultUrls) && response.resultUrls.length > 0) {
            return {
                success: true,
                imageUrl: response.resultUrls[0],
                needsConversion: true
            };
        }

        throw new Error('Z-Image response missing resultUrls');
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function urlToBase64(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return {
            success: true,
            data: Buffer.from(arrayBuffer).toString('base64'),
            mimeType: response.headers.get('content-type') || 'image/png'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    ZIMAGE_ASPECT_RATIOS,
    buildTextToImageRequest,
    isSupportedZImageAspectRatio,
    normalizeResponse,
    urlToBase64
};

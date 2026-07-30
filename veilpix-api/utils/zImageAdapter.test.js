const assert = require('node:assert/strict');
const test = require('node:test');

const {
    ZIMAGE_ASPECT_RATIOS,
    buildTextToImageRequest,
    isSupportedZImageAspectRatio,
    normalizeResponse
} = require('./zImageAdapter');

test('Z-Image exposes only its five documented aspect ratios', () => {
    assert.deepEqual(ZIMAGE_ASPECT_RATIOS, ['1:1', '4:3', '3:4', '16:9', '9:16']);
    assert.equal(isSupportedZImageAspectRatio('auto'), false);
    assert.equal(isSupportedZImageAspectRatio('3:2'), false);
});

test('Z-Image request contains only text-to-image inputs', () => {
    assert.deepEqual(
        buildTextToImageRequest('A ceramic teapot in a sunlit kitchen', '4:3', false),
        {
            prompt: 'A ceramic teapot in a sunlit kitchen',
            aspect_ratio: '4:3',
            nsfw_checker: false
        }
    );
});

test('Z-Image rejects unsupported aspect ratios', () => {
    assert.throws(
        () => buildTextToImageRequest('A test image', 'auto', true),
        /Unsupported Z-Image aspect ratio/
    );
});

test('Z-Image normalizes the first result URL', () => {
    assert.deepEqual(
        normalizeResponse({ resultUrls: ['https://example.com/generated.png'] }),
        {
            success: true,
            imageUrl: 'https://example.com/generated.png',
            needsConversion: true
        }
    );
});

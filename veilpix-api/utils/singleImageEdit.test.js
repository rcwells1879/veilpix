const test = require('node:test');
const assert = require('node:assert/strict');
const nanoBanana2 = require('./nanobanana2Adapter');
const seedream = require('./seedreamAdapter');
const wan = require('./wanImageAdapter');

const imageUrls = [
    'https://example.com/original.png',
    'https://example.com/latest.png'
];

test('Seedream single-photo builders keep only the latest image URL', () => {
    assert.deepEqual(seedream.buildEditRequest(imageUrls, 'edit', '2K').image_urls, [imageUrls[1]]);
    assert.deepEqual(seedream.buildFilterRequest(imageUrls, 'filter', '2K').image_urls, [imageUrls[1]]);
    assert.deepEqual(seedream.buildAdjustRequest(imageUrls, 'adjust', '2K').image_urls, [imageUrls[1]]);
});

test('Seedream combine builder keeps every supplied reference image', () => {
    assert.deepEqual(seedream.buildCombineRequest(imageUrls, 'combine', '2K').image_urls, imageUrls);
});

test('Wan single-photo builders keep only the latest image URL', () => {
    assert.deepEqual(wan.buildEditRequest(imageUrls, 'edit', '2K').input_urls, [imageUrls[1]]);
    assert.deepEqual(wan.buildFilterRequest(imageUrls, 'filter', '2K').input_urls, [imageUrls[1]]);
    assert.deepEqual(wan.buildAdjustRequest(imageUrls, 'adjust', '2K').input_urls, [imageUrls[1]]);
});

test('Wan combine builder keeps every supplied reference image', () => {
    assert.deepEqual(wan.buildCombineRequest(imageUrls, 'combine', '2K').input_urls, imageUrls);
});

test('Nano Banana 2 defaults to automatic aspect ratio', () => {
    assert.equal(nanoBanana2.buildEditRequest(imageUrls, 'edit', '2K').aspect_ratio, 'auto');
    assert.equal(nanoBanana2.buildTextToImageRequest('generate', '2K').aspect_ratio, 'auto');
    assert.equal(nanoBanana2.mapAspectRatio('unsupported'), 'auto');
});

test('Wan image-input builders omit aspect ratio in automatic mode', () => {
    const requests = [
        wan.buildEditRequest(imageUrls, 'edit', '2K'),
        wan.buildFilterRequest(imageUrls, 'filter', '2K'),
        wan.buildAdjustRequest(imageUrls, 'adjust', '2K'),
        wan.buildCombineRequest(imageUrls, 'combine', '2K'),
        wan.buildTextToImageRequest('generate', '2K')
    ];

    for (const request of requests) {
        assert.equal(Object.hasOwn(request, 'aspect_ratio'), false);
    }
});

test('Wan image-input builders keep an explicitly selected aspect ratio', () => {
    const request = wan.buildEditRequest(imageUrls, 'edit', '2K', null, null, '16:9');
    assert.equal(request.aspect_ratio, '16:9');
});

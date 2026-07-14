const test = require('node:test');
const assert = require('node:assert/strict');
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

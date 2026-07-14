const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeedanceRequest } = require('./seedanceAdapter');

test('maps strict Seedance frame inputs to first and last frame fields', () => {
    const payload = buildSeedanceRequest('Move between the frames', {
        firstFrameUrl: 'https://example.com/start.png',
        lastFrameUrl: 'https://example.com/end.png'
    });

    assert.equal(payload.input.first_frame_url, 'https://example.com/start.png');
    assert.equal(payload.input.last_frame_url, 'https://example.com/end.png');
    assert.equal(payload.input.reference_image_urls, undefined);
});

test('maps style and character images only to reference_image_urls', () => {
    const payload = buildSeedanceRequest('Use the character and visual style', {
        referenceImages: [
            'https://example.com/character.png',
            'https://example.com/style.png'
        ]
    });

    assert.deepEqual(payload.input.reference_image_urls, [
        'https://example.com/character.png',
        'https://example.com/style.png'
    ]);
    assert.equal(payload.input.first_frame_url, undefined);
    assert.equal(payload.input.last_frame_url, undefined);
});

test('rejects a last frame without a first frame', () => {
    assert.throws(
        () => buildSeedanceRequest('End here', { lastFrameUrl: 'https://example.com/end.png' }),
        /requires a first frame/
    );
});

test('rejects mixed strict frames and multimodal references', () => {
    assert.throws(
        () => buildSeedanceRequest('Mixed mode', {
            firstFrameUrl: 'https://example.com/start.png',
            referenceImages: ['https://example.com/style.png']
        }),
        /cannot be combined/
    );
});

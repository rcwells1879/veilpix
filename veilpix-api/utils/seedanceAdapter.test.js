const test = require('node:test');
const assert = require('node:assert/strict');
const {
    KIE_CREDIT_USD,
    buildSeedanceRequest,
    estimateSeedanceKieCredits,
    estimateSeedanceVeilPixCredits,
    exceedsSeedanceMediaDurationLimit,
    resolveSeedanceInputMode
} = require('./seedanceAdapter');

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

test('requires a start frame when the client selected strict frame mode', () => {
    assert.throws(
        () => resolveSeedanceInputMode('frames'),
        /requires a start frame/
    );
});

test('does not silently downgrade an explicit frame request to text-to-video', () => {
    assert.equal(
        resolveSeedanceInputMode('frames', { hasFirstFrame: true, hasLastFrame: true }),
        'frames'
    );
});

test('rejects frame files when the client selected multimodal reference mode', () => {
    assert.throws(
        () => resolveSeedanceInputMode('references', { hasFirstFrame: true }),
        /style and character mode was selected/
    );
});

test('keeps backward compatibility by inferring frame mode from older clients', () => {
    assert.equal(
        resolveSeedanceInputMode('', { hasFirstFrame: true }),
        'frames'
    );
});

test('maps every documented Seedance 2.5 setting to the Kie payload', () => {
    const payload = buildSeedanceRequest('Create a grounded product film', {
        variant: 'v2_5',
        duration: -1,
        resolution: '720p',
        aspectRatio: 'adaptive',
        referenceImages: ['https://example.com/product.png'],
        referenceVideos: ['https://example.com/motion.mov'],
        referenceAudios: ['https://example.com/music.mp3'],
        generateAudio: true,
        returnLastFrame: true,
        outputFormat: 'mov',
        webSearch: true,
        nsfwFilterEnabled: false
    });

    assert.equal(payload.model, 'bytedance/seedance-2-5');
    assert.deepEqual(payload.input, {
        prompt: 'Create a grounded product film',
        duration: -1,
        resolution: '720p',
        aspect_ratio: 'adaptive',
        generate_audio: true,
        web_search: true,
        nsfw_checker: false,
        return_last_frame: true,
        output_format: 'mov',
        reference_image_urls: ['https://example.com/product.png'],
        reference_video_urls: ['https://example.com/motion.mov'],
        reference_audio_urls: ['https://example.com/music.mp3']
    });
});

test('uses official Seedance 2.5 beta rates for video-guided billing', () => {
    const pricingContext = {
        variant: 'v2_5',
        resolution: '720p',
        duration: 10,
        hasVideoReference: true,
        referenceVideoDuration: 12
    };

    assert.equal(estimateSeedanceKieCredits(pricingContext), 38 * 22);
    assert.equal(estimateSeedanceVeilPixCredits(pricingContext), 68);
});

test('every Seedance 2.5 pricing path preserves at least the 12 percent margin', () => {
    const cases = [
        { resolution: '480p', duration: 5, hasVideoReference: false, referenceVideoDuration: 0 },
        { resolution: '720p', duration: 5, hasVideoReference: false, referenceVideoDuration: 0 },
        { resolution: '480p', duration: 5, hasVideoReference: true, referenceVideoDuration: 7 },
        { resolution: '720p', duration: 5, hasVideoReference: true, referenceVideoDuration: 7 }
    ];

    for (const pricingCase of cases) {
        const context = { variant: 'v2_5', ...pricingCase };
        const kieCostUsd = estimateSeedanceKieCredits(context) * KIE_CREDIT_USD;
        const customerRevenueUsd = estimateSeedanceVeilPixCredits(context) * 0.0699;
        const margin = (customerRevenueUsd - kieCostUsd) / customerRevenueUsd;
        assert.ok(margin >= 0.12, `${pricingCase.resolution} margin was ${(margin * 100).toFixed(2)}%`);
    }
});

test('prices automatic Seedance 2.5 duration against the 30 second ceiling', () => {
    assert.equal(estimateSeedanceKieCredits({
        variant: 'v2_5',
        resolution: '480p',
        duration: -1
    }), 28 * 30);
});

test('accepts nominal 30 second reference media with encoder padding', () => {
    assert.equal(exceedsSeedanceMediaDurationLimit(30, 30), false);
    assert.equal(exceedsSeedanceMediaDurationLimit(30.2, 30), false);
    assert.equal(exceedsSeedanceMediaDurationLimit(30.251, 30), true);
    assert.equal(exceedsSeedanceMediaDurationLimit(31, 30), true);
});

test('enforces Seedance 2.5 multimodal reference limits', () => {
    assert.throws(
        () => buildSeedanceRequest('Too many videos', {
            variant: 'v2_5',
            referenceVideos: Array.from({ length: 11 }, (_, index) => `https://example.com/${index}.mp4`)
        }),
        /up to 10 reference videos/
    );
});

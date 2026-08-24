const test = require('node:test');
const assert = require('node:assert/strict');
const {
    WAN3_MODELS,
    buildWan3Request,
    estimateWan3KieCredits,
    estimateWan3VeilPixCredits,
    normalizeWan3Response
} = require('./wan3Adapter');

test('maps every Wan 3.0 reference type and After Dark setting', () => {
    const payload = buildWan3Request('Use Image1 and Video1', {
        variant: 'prime',
        inputMode: 'references',
        duration: 5,
        resolution: '480p',
        aspectRatio: '9:16',
        referenceImages: ['https://example.com/image.png'],
        referenceVideos: ['https://example.com/video.mp4'],
        referenceAudios: ['https://example.com/audio.mp3'],
        audio: false,
        seed: 42,
        nsfwFilterEnabled: false
    });

    assert.equal(payload.model, WAN3_MODELS.prime);
    assert.deepEqual(payload.input.reference_image_urls, ['https://example.com/image.png']);
    assert.deepEqual(payload.input.reference_video_urls, ['https://example.com/video.mp4']);
    assert.deepEqual(payload.input.reference_audio_urls, ['https://example.com/audio.mp3']);
    assert.equal(payload.input.resolution, '480P');
    assert.equal(payload.input.aspect_ratio, '9:16');
    assert.equal(payload.input.audio, false);
    assert.equal(payload.input.nsfw_checker, false);
    assert.equal(payload.input.seed, 42);
});

test('supports frames, file, link, and text-only modes without mixing them', () => {
    assert.equal(buildWan3Request('Animate', {
        inputMode: 'frames',
        firstFrameUrl: 'https://example.com/start.png',
        lastFrameUrl: 'https://example.com/end.png'
    }).input.last_frame_url, 'https://example.com/end.png');
    assert.deepEqual(buildWan3Request('Use file', {
        inputMode: 'file',
        referenceFileUrl: 'https://example.com/brief.pdf'
    }).input.reference_file_urls, ['https://example.com/brief.pdf']);
    assert.deepEqual(buildWan3Request('Use link', {
        inputMode: 'link',
        referenceLink: 'https://example.com/article'
    }).input.reference_link_urls, ['https://example.com/article']);
    assert.equal(buildWan3Request('Text only', { inputMode: 'references' }).input.reference_image_urls, undefined);
    assert.throws(() => buildWan3Request('Mixed', {
        inputMode: 'frames',
        firstFrameUrl: 'https://example.com/start.png',
        referenceImages: ['https://example.com/ref.png']
    }), /cannot be combined/);
});

test('prices Standard and Prime from current Kie per-second credit rates', () => {
    assert.equal(estimateWan3KieCredits({ variant: 'standard', resolution: '480P', duration: 5 }), 40);
    assert.equal(estimateWan3VeilPixCredits({ variant: 'standard', resolution: '480P', duration: 5 }), 4);
    assert.equal(estimateWan3KieCredits({ variant: 'prime', resolution: '480P', duration: 5 }), 61);
    assert.equal(estimateWan3VeilPixCredits({ variant: 'prime', resolution: '480P', duration: 5 }), 5);
});

test('normalizes Kie Wan 3.0 task results', () => {
    assert.deepEqual(normalizeWan3Response(JSON.stringify({ resultUrls: ['https://example.com/result.mp4'] })), {
        success: true,
        videoUrl: 'https://example.com/result.mp4'
    });
});

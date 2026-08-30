const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildOpenRouterSeedanceRequest,
    isOpenRouterContentPolicyError,
    selectSeedanceUpstream,
    safeOpenRouterPollingUrl
} = require('./openRouterSeedance');

test('treats every task-creation 400 as safety and recognizes asynchronous moderation failures', () => {
    const policyCodes = [
        'InputTextSensitiveContentDetected',
        'InputImageSensitiveContentDetected',
        'InputVideoSensitiveContentDetected',
        'InputAudioSensitiveContentDetected.PolicyViolation',
        'OutputTextSensitiveContentDetected',
        'OutputImageSensitiveContentDetected',
        'OutputVideoSensitiveContentDetected',
        'OutputVideoSensitiveContentDetected.PolicyViolation',
        'SensitiveContentDetected.SevereViolation',
        'ContentRiskBlocked',
        'InputTextRiskDetection',
        'OutputImageRiskDetection'
    ];

    for (const code of policyCodes) {
        assert.equal(isOpenRouterContentPolicyError({ error: { code } }), true, code);
    }
    assert.equal(isOpenRouterContentPolicyError({ error: 'Content policy violation' }), true);
    assert.equal(isOpenRouterContentPolicyError({ error: { code: 'InvalidParameter.Duration' } }, 400), true);
    assert.equal(isOpenRouterContentPolicyError({ error: { code: 'MissingParameter.Prompt' } }, '400'), true);
    assert.equal(isOpenRouterContentPolicyError({ error: { code: 'InvalidParameter.Duration' } }), false);
    assert.equal(isOpenRouterContentPolicyError({ error: { code: 'MissingParameter.Prompt' } }), false);
});

test('routes filtered Seedance through the configured provider and After Dark through Kie', () => {
    assert.equal(selectSeedanceUpstream('openrouter', true), 'openrouter');
    assert.equal(selectSeedanceUpstream('openrouter', false), 'kie');
    assert.equal(selectSeedanceUpstream('kie', true), 'kie');
    assert.equal(selectSeedanceUpstream(undefined, true), 'kie');
});

test('maps Seedance frames and multimodal references to the OpenRouter video API', () => {
    const framePayload = buildOpenRouterSeedanceRequest('Move between the frames', {
        variant: 'fast',
        firstFrameUrl: 'https://example.com/start.png',
        lastFrameUrl: 'https://example.com/end.png'
    });
    assert.equal(framePayload.model, 'bytedance/seedance-2.0-fast');
    assert.deepEqual(framePayload.frame_images, [
        {
            type: 'image_url',
            image_url: { url: 'https://example.com/start.png' },
            frame_type: 'first_frame'
        },
        {
            type: 'image_url',
            image_url: { url: 'https://example.com/end.png' },
            frame_type: 'last_frame'
        }
    ]);

    const referencePayload = buildOpenRouterSeedanceRequest('Use every reference', {
        variant: 'mini',
        referenceImages: ['https://example.com/look.png'],
        referenceVideos: ['https://example.com/motion.mp4'],
        referenceAudios: ['https://example.com/voice.mp3']
    });
    assert.deepEqual(referencePayload.input_references, [
        { type: 'image_url', image_url: { url: 'https://example.com/look.png' } },
        { type: 'video_url', video_url: { url: 'https://example.com/motion.mp4' } },
        { type: 'audio_url', audio_url: { url: 'https://example.com/voice.mp3' } }
    ]);
});

test('omits the unsupported NSFW parameter during the OpenRouter trial', () => {
    const payload = buildOpenRouterSeedanceRequest('A private creative scene', {
        nsfwFilterEnabled: false
    });
    assert.equal(payload.nsfw_checker, undefined);
    assert.equal(JSON.stringify(payload).includes('nsfw'), false);
});

test('normalizes OpenRouter-only Seedance request differences', () => {
    const payload = buildOpenRouterSeedanceRequest('Choose a natural composition', {
        variant: 'v2_5',
        duration: -1,
        aspectRatio: 'adaptive',
        outputFormat: 'mov'
    });
    assert.equal(payload.model, 'bytedance/seedance-2.5');
    assert.equal(payload.duration, 30);
    assert.equal(payload.aspect_ratio, undefined);
    assert.equal(payload.provider.options.seed.parameters.output_format, 'mov');
});

test('rejects resolutions unavailable for the selected OpenRouter Seedance model', () => {
    assert.throws(
        () => buildOpenRouterSeedanceRequest('Unsupported resolution', {
            variant: 'v2_5',
            resolution: '1080p'
        }),
        /does not support 1080p/
    );
    assert.equal(buildOpenRouterSeedanceRequest('Supported resolution', {
        variant: 'regular',
        resolution: '1080p'
    }).resolution, '1080p');
});

test('accepts only OpenRouter video polling URLs', () => {
    assert.match(safeOpenRouterPollingUrl('/api/v1/videos/job-123', 'job-123'), /\/api\/v1\/videos\/job-123$/);
    assert.throws(
        () => safeOpenRouterPollingUrl('https://example.com/steal-key', 'job-123'),
        /invalid polling URL/
    );
});

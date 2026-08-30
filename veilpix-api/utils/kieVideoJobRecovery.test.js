const test = require('node:test');
const assert = require('node:assert/strict');
const {
    PENDING_VIDEO_JOB_TTL_MS,
    creditsForCompletedVideo,
    deliveryProviderForState,
    normalizeCompletedVideo,
    providerFailureMessage
} = require('./kieVideoJobRecovery');

test('keeps provider jobs recoverable for 48 hours', () => {
    assert.equal(PENDING_VIDEO_JOB_TTL_MS, 48 * 60 * 60 * 1000);
});

test('carries exact video variants into cross-browser delivery metadata', () => {
    assert.equal(deliveryProviderForState({ provider: 'seedance', variant: 'fast' }, 'seedance-video'), 'seedance-fast');
    assert.equal(deliveryProviderForState({ provider: 'wan3', variant: 'prime' }, 'wan3-video'), 'wan3-prime');
    assert.equal(deliveryProviderForState({ provider: 'seedance' }, 'seedance-video'), 'seedance-video');
});

test('normalizes completed video results from every Kie video provider', () => {
    assert.equal(normalizeCompletedVideo('seedance', {
        resultJson: JSON.stringify({ resultUrls: ['https://example.com/seedance.mp4'] })
    }).videoUrl, 'https://example.com/seedance.mp4');
    assert.equal(normalizeCompletedVideo('wan', {
        resultJson: JSON.stringify({ resultUrls: ['https://example.com/wan.mp4'] })
    }).videoUrl, 'https://example.com/wan.mp4');
    assert.equal(normalizeCompletedVideo('wan3', {
        resultJson: JSON.stringify({ resultUrls: ['https://example.com/wan3.mp4'] })
    }).videoUrl, 'https://example.com/wan3.mp4');
});

test('normalizes completed OpenRouter Seedance jobs without exposing credentials', () => {
    const normalized = normalizeCompletedVideo('seedance', {
        id: 'job-123',
        unsigned_urls: ['https://cdn.example.com/seedance.mp4']
    }, 'openrouter');
    assert.equal(normalized.videoUrl, 'https://cdn.example.com/seedance.mp4');
    assert.equal(normalized.sourceHeaders, undefined);
});

test('normalizes asynchronous OpenRouter output moderation failures for the custom warning', () => {
    const message = providerFailureMessage({ upstreamProvider: 'openrouter' }, {
        status: 'failed',
        error: { code: 'OutputVideoSensitiveContentDetected' }
    });
    assert.match(message, /Content policy violation/i);
    assert.match(message, /content moderation provider/i);
});

test('reconciles every video provider against the settled Kie charge', () => {
    assert.equal(creditsForCompletedVideo({
        provider: 'wan',
        estimatedCredits: 7,
        duration: 5
    }, { creditsConsumed: 999 }), 101.73);

    const seedanceCredits = creditsForCompletedVideo({
        provider: 'seedance',
        estimatedCredits: 30,
        duration: 5
    }, { creditsConsumed: 100 });
    assert.equal(seedanceCredits, 10.19);
});

test('keeps OpenRouter Seedance billing at the displayed Kie-baseline estimate', () => {
    const credits = creditsForCompletedVideo({
        provider: 'seedance',
        upstreamProvider: 'openrouter',
        estimatedCredits: 1.55
    }, {
        usage: { cost: 0.0568 }
    });
    assert.equal(credits, 1.55);
});

test('does not increase the displayed OpenRouter charge when provider cost is higher', () => {
    const credits = creditsForCompletedVideo({
        provider: 'seedance',
        upstreamProvider: 'openrouter',
        estimatedCredits: 1.55
    }, {
        usage: { cost: 0.1345 }
    });
    assert.equal(credits, 1.55);
});

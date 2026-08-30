const test = require('node:test');
const assert = require('node:assert/strict');
const {
    PENDING_VIDEO_JOB_TTL_MS,
    creditsForCompletedVideo,
    normalizeCompletedVideo
} = require('./kieVideoJobRecovery');
const { veilpixCreditsFromUsd } = require('./creditEconomics');

test('keeps provider jobs recoverable for 48 hours', () => {
    assert.equal(PENDING_VIDEO_JOB_TTL_MS, 48 * 60 * 60 * 1000);
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

test('reconciles OpenRouter Seedance billing against settled USD cost', () => {
    const credits = creditsForCompletedVideo({
        provider: 'seedance',
        upstreamProvider: 'openrouter',
        estimatedCredits: 30
    }, {
        usage: { cost: 0.1512 }
    });
    assert.equal(credits, Math.min(veilpixCreditsFromUsd(0.1512), 30));
});

test('never charges more than the Seedance amount displayed when an OpenRouter job started', () => {
    const credits = creditsForCompletedVideo({
        provider: 'seedance',
        upstreamProvider: 'openrouter',
        estimatedCredits: 1.55
    }, {
        usage: { cost: 0.1345 }
    });
    assert.equal(credits, 1.55);
});

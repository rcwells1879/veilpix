const test = require('node:test');
const assert = require('node:assert/strict');
const {
    PENDING_VIDEO_JOB_TTL_MS,
    creditsForCompletedVideo,
    normalizeCompletedVideo
} = require('./kieVideoJobRecovery');

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

test('uses fixed legacy Wan pricing and provider-aware Seedance pricing', () => {
    assert.equal(creditsForCompletedVideo({
        provider: 'wan',
        estimatedCredits: 7,
        duration: 5
    }, { creditsConsumed: 999 }), 7);

    const seedanceCredits = creditsForCompletedVideo({
        provider: 'seedance',
        estimatedCredits: 3,
        duration: -1
    }, { creditsConsumed: 100 });
    assert.ok(seedanceCredits > 3);
});

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

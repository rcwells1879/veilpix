const test = require('node:test');
const assert = require('node:assert/strict');
const {
    WAN_VIDEO_KIE_PRICING,
    estimateWanKieCredits,
    estimateWanVeilPixCredits
} = require('./wanAdapter');
const { KIE_CREDIT_USD } = require('./creditEconomics');
const assertGenerationPricing = require('./testing/assertGenerationPricing');

test('uses current fixed Wan 2.6 charges for each duration and resolution', () => {
    assert.equal(estimateWanKieCredits({ duration: 5, resolution: '720p' }), 70);
    assert.equal(estimateWanKieCredits({ duration: 10, resolution: '1080p' }), 209.5);
    assert.equal(estimateWanKieCredits({ duration: 15, resolution: '1080p' }), 315);
    assert.equal(estimateWanVeilPixCredits({ duration: 10, resolution: '1080p' }), 23.92);
});

test('uses Wan 2.7 per-second pricing when references select R2V', () => {
    assert.equal(estimateWanKieCredits({
        duration: 5,
        resolution: '720p',
        usesReferenceToVideo: true
    }), 80);
    assert.equal(estimateWanVeilPixCredits({
        duration: 10,
        resolution: '1080p',
        usesReferenceToVideo: true
    }), 27.40);
});

test('every legacy Wan duration, resolution, and reference tier preserves the margin', () => {
    for (const resolution of Object.keys(WAN_VIDEO_KIE_PRICING.referencePerSecond)) {
        for (const duration of [5, 10, 15]) {
            for (const usesReferenceToVideo of [false, true]) {
                if (usesReferenceToVideo && duration > 10) continue;
                const context = { duration, resolution, usesReferenceToVideo };
                const providerCostUsd = estimateWanKieCredits(context) * KIE_CREDIT_USD;
                assertGenerationPricing(estimateWanVeilPixCredits(context), providerCostUsd, `${resolution} ${duration}s`);
            }
        }
    }
});

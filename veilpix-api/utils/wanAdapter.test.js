const test = require('node:test');
const assert = require('node:assert/strict');
const {
    WAN_VIDEO_KIE_PRICING,
    estimateWanKieCredits,
    estimateWanVeilPixCredits
} = require('./wanAdapter');
const { KIE_CREDIT_USD, MIN_NET_USD_PER_VEILPIX_CREDIT, TARGET_MARGIN } = require('./creditEconomics');

test('uses current fixed Wan 2.6 charges for each duration and resolution', () => {
    assert.equal(estimateWanKieCredits({ duration: 5, resolution: '720p' }), 70);
    assert.equal(estimateWanKieCredits({ duration: 10, resolution: '1080p' }), 209.5);
    assert.equal(estimateWanKieCredits({ duration: 15, resolution: '1080p' }), 315);
    assert.equal(estimateWanVeilPixCredits({ duration: 10, resolution: '1080p' }), 21.34);
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
    }), 24.44);
});

test('every legacy Wan duration, resolution, and reference tier preserves the margin', () => {
    for (const resolution of Object.keys(WAN_VIDEO_KIE_PRICING.referencePerSecond)) {
        for (const duration of [5, 10, 15]) {
            for (const usesReferenceToVideo of [false, true]) {
                if (usesReferenceToVideo && duration > 10) continue;
                const context = { duration, resolution, usesReferenceToVideo };
                const providerCostUsd = estimateWanKieCredits(context) * KIE_CREDIT_USD;
                const netRevenueUsd = estimateWanVeilPixCredits(context) * MIN_NET_USD_PER_VEILPIX_CREDIT;
                const margin = (netRevenueUsd - providerCostUsd) / netRevenueUsd;
                assert.ok(margin + 1e-10 >= TARGET_MARGIN, `${resolution} ${duration}s margin was ${margin}`);
            }
        }
    }
});

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    MIN_NET_USD_PER_VEILPIX_CREDIT,
    PACKAGE_ECONOMICS,
    PACKAGE_MARGIN_TARGETS,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
} = require('./creditEconomics');
const assertGenerationPricing = require('./testing/assertGenerationPricing');

test('uses the observed international Stripe fee for every credit package', () => {
    assert.equal(PACKAGE_ECONOMICS['50_credits'].stripeFeeUsd, 0.48);
    assert.equal(PACKAGE_ECONOMICS['100_credits'].stripeFeeUsd, 0.61);
    assert.equal(PACKAGE_ECONOMICS['200_credits'].stripeFeeUsd, 0.83);
    assert.equal(MIN_NET_USD_PER_VEILPIX_CREDIT, 11.16 / 200);
    assert.equal(BILLABLE_USD_PER_VEILPIX_CREDIT, 0.04381);
    assert.deepEqual(PACKAGE_MARGIN_TARGETS, {
        '50_credits': 0.22,
        '100_credits': 0.21,
        '200_credits': 0.20
    });
});

test('rounds all model charges up to the supported hundredth-credit precision', () => {
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 0.5), 0.5);
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 1.011), 1.02);
    assert.equal(veilpixCreditsFromKieCredits(302.4), 34.52);
});

test('every package preserves its after-fee margin and the minimum price increase', () => {
    for (const kieCredits of [0.01, 0.8, 5.5, 18, 70, 302.4, 836, 3420]) {
        const providerCostUsd = kieCredits * 0.005;
        const chargedCredits = veilpixCreditsFromKieCredits(kieCredits);
        assertGenerationPricing(chargedCredits, providerCostUsd, `${kieCredits} Kie credits`);
    }
});

test('the ten percent floor applies to the previous rounded charge', () => {
    assert.equal(veilpixCreditsFromUsd(0.004), 0.10); // Previously 0.09, not the unrounded 0.0815.
    assert.equal(veilpixCreditsFromUsd(0.00001), 0.02); // Previously 0.01.
});

test('zero, negative, and missing costs remain free', () => {
    for (const value of [0, -1, undefined, null, NaN]) {
        assert.equal(veilpixCreditsFromUsd(value), 0);
        assert.equal(veilpixCreditsFromKieCredits(value), 0);
    }
});

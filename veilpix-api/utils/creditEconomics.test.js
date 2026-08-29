const assert = require('node:assert/strict');
const test = require('node:test');

const {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    CREDIT_PACKAGES,
    MIN_NET_USD_PER_VEILPIX_CREDIT,
    PACKAGE_ECONOMICS,
    TARGET_MARGIN,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
} = require('./creditEconomics');

test('uses the observed international Stripe fee for every credit package', () => {
    assert.equal(PACKAGE_ECONOMICS['50_credits'].stripeFeeUsd, 0.48);
    assert.equal(PACKAGE_ECONOMICS['100_credits'].stripeFeeUsd, 0.61);
    assert.equal(PACKAGE_ECONOMICS['200_credits'].stripeFeeUsd, 0.83);
    assert.equal(MIN_NET_USD_PER_VEILPIX_CREDIT, 11.16 / 200);
    assert.equal(BILLABLE_USD_PER_VEILPIX_CREDIT, (11.16 / 200) * 0.88);
});

test('rounds all model charges up to the supported hundredth-credit precision', () => {
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 0.5), 0.5);
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 1.011), 1.02);
    assert.equal(veilpixCreditsFromKieCredits(302.4), 30.8);
});

test('every package preserves at least a 12 percent after-fee margin', () => {
    for (const kieCredits of [0.8, 5.5, 18, 70, 302.4, 836, 3420]) {
        const providerCostUsd = kieCredits * 0.005;
        const chargedCredits = veilpixCreditsFromKieCredits(kieCredits);
        for (const [packageName, packageConfig] of Object.entries(CREDIT_PACKAGES)) {
            const netUsdPerCredit = PACKAGE_ECONOMICS[packageName].netUsdPerCredit;
            const netRevenueUsd = chargedCredits * netUsdPerCredit;
            const margin = (netRevenueUsd - providerCostUsd) / netRevenueUsd;
            assert.ok(
                margin + 1e-10 >= TARGET_MARGIN,
                `${packageConfig.name} margin was ${(margin * 100).toFixed(3)}% for ${kieCredits} Kie credits`
            );
        }
    }
});

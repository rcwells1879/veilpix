const assert = require('node:assert/strict');
const { PACKAGE_ECONOMICS, PACKAGE_MARGIN_TARGETS } = require('../creditEconomics');

module.exports = function assertGenerationPricing(chargedCredits, providerCostUsd, label = '') {
    // Independent snapshot of the prices on main before this increase.
    const previousCredits = Math.ceil((providerCostUsd / 0.049104 - 1e-12) * 100) / 100;
    assert.ok(chargedCredits + 1e-10 >= previousCredits * 1.10, `${label}: increase below 10%`);
    assert.ok(Math.abs(chargedCredits * 100 - Math.round(chargedCredits * 100)) < 1e-8);
    for (const [packageName, economics] of Object.entries(PACKAGE_ECONOMICS)) {
        const grossRevenueUsd = chargedCredits * economics.grossUsdPerCredit;
        const feesUsd = chargedCredits * economics.stripeFeeUsd / economics.credits;
        const margin = (grossRevenueUsd - feesUsd - providerCostUsd) / grossRevenueUsd;
        assert.ok(
            margin + 1e-10 >= PACKAGE_MARGIN_TARGETS[packageName],
            `${label}: ${packageName} margin was ${(margin * 100).toFixed(3)}%`
        );
    }
};

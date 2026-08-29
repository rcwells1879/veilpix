/**
 * Shared VeilPix credit economics.
 *
 * The pricing floor is the package with the lowest net revenue per credit
 * after the current Stripe international-card fee (4.4% + $0.30). Provider
 * costs are divided by 88% of that floor so every model preserves at least a
 * 12% contribution margin, even when credits came from the best-value pack.
 */

const TARGET_MARGIN = 0.12;
const KIE_CREDIT_USD = 0.005;
const STRIPE_CARD_FEE_RATE = 0.044;
const STRIPE_FIXED_FEE_USD = 0.30;

const CREDIT_PACKAGES = {
    '50_credits': {
        credits: 50,
        priceUsd: 3.99,
        name: '50 Credits',
        description: 'Perfect for casual editing'
    },
    '100_credits': {
        credits: 100,
        priceUsd: 6.99,
        name: '100 Credits',
        description: 'Great for regular users'
    },
    '200_credits': {
        credits: 200,
        priceUsd: 11.99,
        name: '200 Credits',
        description: 'Best value - Most popular',
        popular: true
    }
};

function roundUsdUp(value) {
    return Math.ceil((Number(value) - 1e-12) * 100) / 100;
}

function estimateStripeFeeUsd(priceUsd) {
    return roundUsdUp((Number(priceUsd) || 0) * STRIPE_CARD_FEE_RATE + STRIPE_FIXED_FEE_USD);
}

function getPackageEconomics(packageConfig) {
    const grossUsd = Number(packageConfig.priceUsd);
    const credits = Number(packageConfig.credits);
    const stripeFeeUsd = estimateStripeFeeUsd(grossUsd);
    const netUsd = grossUsd - stripeFeeUsd;
    return {
        grossUsd,
        credits,
        stripeFeeUsd,
        netUsd,
        grossUsdPerCredit: grossUsd / credits,
        netUsdPerCredit: netUsd / credits
    };
}

const PACKAGE_ECONOMICS = Object.fromEntries(
    Object.entries(CREDIT_PACKAGES).map(([key, value]) => [key, getPackageEconomics(value)])
);
const MIN_GROSS_USD_PER_VEILPIX_CREDIT = Math.min(
    ...Object.values(PACKAGE_ECONOMICS).map(value => value.grossUsdPerCredit)
);
const MIN_NET_USD_PER_VEILPIX_CREDIT = Math.min(
    ...Object.values(PACKAGE_ECONOMICS).map(value => value.netUsdPerCredit)
);
const BILLABLE_USD_PER_VEILPIX_CREDIT = MIN_NET_USD_PER_VEILPIX_CREDIT * (1 - TARGET_MARGIN);

function veilpixCreditsFromUsd(usdCost) {
    const rawCredits = Math.max(0, (Number(usdCost) || 0) / BILLABLE_USD_PER_VEILPIX_CREDIT);
    if (rawCredits <= 0) return 0;
    return Math.ceil((rawCredits - 1e-12) * 100) / 100;
}

function veilpixCreditsFromKieCredits(kieCredits) {
    return veilpixCreditsFromUsd((Number(kieCredits) || 0) * KIE_CREDIT_USD);
}

module.exports = {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    CREDIT_PACKAGES,
    KIE_CREDIT_USD,
    MIN_GROSS_USD_PER_VEILPIX_CREDIT,
    MIN_NET_USD_PER_VEILPIX_CREDIT,
    PACKAGE_ECONOMICS,
    STRIPE_CARD_FEE_RATE,
    STRIPE_FIXED_FEE_USD,
    TARGET_MARGIN,
    estimateStripeFeeUsd,
    getPackageEconomics,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
};

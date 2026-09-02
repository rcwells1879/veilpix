/**
 * Shared VeilPix credit economics.
 *
 * One generation price applies to every package. Reserve each package's
 * target margin on gross revenue after Stripe fees (4.4% + $0.30), then use
 * the smallest remaining provider budget. Round charges up to hundredths.
 */

const TARGET_MARGIN = 0.20;
const PACKAGE_MARGIN_TARGETS = {
    '50_credits': 0.22,
    '100_credits': 0.21,
    '200_credits': TARGET_MARGIN
};
const MINIMUM_PRICE_INCREASE = 0.10;
// Freeze the pre-increase conversion from main at 4387967; never compound it.
const PREVIOUS_BILLABLE_USD_PER_VEILPIX_CREDIT = (11.16 / 200) * 0.88;
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
const BILLABLE_USD_PER_VEILPIX_CREDIT = Math.min(
    ...Object.entries(PACKAGE_ECONOMICS).map(([key, value]) => (
        value.grossUsd * (1 - PACKAGE_MARGIN_TARGETS[key]) - value.stripeFeeUsd
    ) / value.credits)
);

function veilpixCreditsFromUsd(usdCost) {
    const costUsd = Math.max(0, Number(usdCost) || 0);
    if (costUsd <= 0) return 0;
    const previousCredits = Math.ceil((costUsd / PREVIOUS_BILLABLE_USD_PER_VEILPIX_CREDIT - 1e-12) * 100) / 100;
    const rawCredits = Math.max(
        costUsd / BILLABLE_USD_PER_VEILPIX_CREDIT,
        previousCredits * (1 + MINIMUM_PRICE_INCREASE)
    );
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
    MINIMUM_PRICE_INCREASE,
    PACKAGE_ECONOMICS,
    PACKAGE_MARGIN_TARGETS,
    PREVIOUS_BILLABLE_USD_PER_VEILPIX_CREDIT,
    STRIPE_CARD_FEE_RATE,
    STRIPE_FIXED_FEE_USD,
    TARGET_MARGIN,
    estimateStripeFeeUsd,
    getPackageEconomics,
    veilpixCreditsFromKieCredits,
    veilpixCreditsFromUsd
};

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const policy = require('../config/generationPricing.json');

const {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    IMAGE_WORKFLOWS,
    VEILPIX_CREDIT_USD,
    getImageCreditDetails,
    veilpixCreditsFromUsd
} = require('./imageCreditPricing');

const CASES = [
    ['Nano Banana 2 1K', 'nanobanana2', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.9, 0.66],
    ['Nano Banana 2 2K', 'nanobanana2', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 1.35, 0.98],
    ['Nano Banana 2 4K', 'nanobanana2', '4K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 2.2, 2],
    ['Seedream 5 Lite 2K', 'seedream', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.62, 0.45],
    ['Seedream 5 Lite combine', 'seedream', '4K', IMAGE_WORKFLOWS.IMAGE_TO_IMAGE, 'lite', 2, 0.68, 0.49],
    ['Seedream 5 Pro 1K', 'seedream', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'pro', 0, 0.79, 0.57],
    ['Seedream 5 Pro 1K combine', 'seedream', '1K', IMAGE_WORKFLOWS.IMAGE_TO_IMAGE, 'pro', 2, 0.84, 0.61],
    ['Seedream 5 Pro 2K', 'seedream', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'pro', 0, 2.2, 2],
    ['Wan 2.7 standard', 'wanimage', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.54, 0.4],
    ['Wan 2.7 Pro 4K', 'wanimage', '4K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 1.35, 0.98]
];

test('rounds new image prices to hundredths even above one credit', () => {
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 0.5), 0.5);
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 1.01), 1.01);
    assert.equal(veilpixCreditsFromUsd(0), 0);
});

for (const [name, provider, resolution, workflow, tier, imageCount, expectedCredits, previousCredits] of CASES) {
    test(`${name} increases at least 10% and meets every after-fee margin floor`, () => {
        const details = getImageCreditDetails(provider, resolution, workflow, tier, imageCount);
        assert.equal(details.credits, expectedCredits);
        assert.ok(details.credits + 1e-10 >= previousCredits * 1.1);
        for (const pack of Object.values(policy.creditPackages)) {
            const revenue = details.credits * pack.priceUsd / pack.credits;
            const packFee = Math.round((pack.priceUsd * policy.stripePercentageFee + policy.stripeFixedFeeUsd) * 100) / 100;
            const fee = details.credits * packFee / pack.credits;
            const margin = (revenue - fee - details.costUsd) / revenue;
            assert.ok(margin + 1e-10 >= pack.targetMargin, `${name} ${pack.credits}-pack margin was ${margin}`);
        }
    });
}

test('the customer credit value remains tied to the 100-credit package', () => {
    assert.equal(VEILPIX_CREDIT_USD, 0.0699);
});

test('fractional migration uses an atomic conditional deduction', () => {
    const migration = fs.readFileSync(
        path.join(__dirname, '..', 'schema-migration-fractional-credits.sql'),
        'utf8'
    );
    assert.match(migration, /credits_remaining TYPE NUMERIC\(12,2\)/);
    assert.match(migration, /credits_remaining >= normalized_credits/);
    assert.match(migration, /RETURN FOUND/);
});

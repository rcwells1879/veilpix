const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    IMAGE_WORKFLOWS,
    MIN_NET_USD_PER_VEILPIX_CREDIT,
    TARGET_MARGIN,
    getImageCreditDetails,
    getNanoBananaProCreditCost,
    veilpixCreditsFromUsd
} = require('./imageCreditPricing');

const CASES = [
    ['Nano Banana 2 1K', 'nanobanana2', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.82],
    ['Nano Banana 2 2K', 'nanobanana2', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 1.23],
    ['Nano Banana 2 4K', 'nanobanana2', '4K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 1.84],
    ['Seedream 5 Lite 2K', 'seedream', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.57],
    ['Seedream 5 Lite combine', 'seedream', '4K', IMAGE_WORKFLOWS.IMAGE_TO_IMAGE, 'lite', 2, 0.62],
    ['Seedream 5 Pro 1K', 'seedream', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'pro', 0, 0.72],
    ['Seedream 5 Pro 1K combine', 'seedream', '1K', IMAGE_WORKFLOWS.IMAGE_TO_IMAGE, 'pro', 2, 0.77],
    ['Seedream 5 Pro 2K', 'seedream', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'pro', 0, 1.43],
    ['Wan 2.7 standard', 'wanimage', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.49],
    ['Wan 2.7 Pro 4K', 'wanimage', '4K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 1.23],
    ['Z-Image Turbo', 'zimage', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.09]
];

test('uses hundredth-credit precision above and below one credit', () => {
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 0.5), 0.5);
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 1.01), 1.01);
});

for (const [name, provider, resolution, workflow, tier, imageCount, expectedCredits] of CASES) {
    test(`${name} charges ${expectedCredits} credits with at least a 12% margin`, () => {
        const details = getImageCreditDetails(provider, resolution, workflow, tier, imageCount);
        assert.equal(details.credits, expectedCredits);
        const exactRevenue = details.credits * MIN_NET_USD_PER_VEILPIX_CREDIT;
        const realizedMargin = (exactRevenue - details.costUsd) / exactRevenue;
        assert.ok(realizedMargin + 0.0001 >= TARGET_MARGIN, `${name} margin was ${realizedMargin}`);
    });
}

test('Z-Image charge preserves the underlying Kie cost and target margin', () => {
    const details = getImageCreditDetails('zimage', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE);
    assert.equal(details.kieCredits, 0.8);
    assert.equal(details.costUsd, 0.004);
    assert.equal(details.credits, 0.09);
    assert.equal(details.chargedAmountUsd, 0.0054);
});

test('the compatibility Nano Banana Pro route prices 1/2K and 4K independently', () => {
    assert.equal(getNanoBananaProCreditCost('1K'), 1.84);
    assert.equal(getNanoBananaProCreditCost('2K'), 1.84);
    assert.equal(getNanoBananaProCreditCost('4K'), 2.45);
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

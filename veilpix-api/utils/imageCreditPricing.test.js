const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    BILLABLE_USD_PER_VEILPIX_CREDIT,
    IMAGE_WORKFLOWS,
    TARGET_MARGIN,
    VEILPIX_CREDIT_USD,
    getImageCreditDetails,
    veilpixCreditsFromUsd
} = require('./imageCreditPricing');

const CASES = [
    ['Nano Banana 2 1K', 'nanobanana2', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.66],
    ['Nano Banana 2 2K', 'nanobanana2', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.98],
    ['Nano Banana 2 4K', 'nanobanana2', '4K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 2],
    ['Seedream 5 Lite 2K', 'seedream', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.45],
    ['Seedream 5 Lite combine', 'seedream', '4K', IMAGE_WORKFLOWS.IMAGE_TO_IMAGE, 'lite', 2, 0.49],
    ['Seedream 5 Pro 1K', 'seedream', '1K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'pro', 0, 0.57],
    ['Seedream 5 Pro 1K combine', 'seedream', '1K', IMAGE_WORKFLOWS.IMAGE_TO_IMAGE, 'pro', 2, 0.61],
    ['Seedream 5 Pro 2K', 'seedream', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'pro', 0, 2],
    ['Wan 2.7 standard', 'wanimage', '2K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.4],
    ['Wan 2.7 Pro 4K', 'wanimage', '4K', IMAGE_WORKFLOWS.TEXT_TO_IMAGE, 'lite', 0, 0.98]
];

test('uses fractional credits only when the unrounded charge is below one credit', () => {
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 0.5), 0.5);
    assert.equal(veilpixCreditsFromUsd(BILLABLE_USD_PER_VEILPIX_CREDIT * 1.01), 2);
});

for (const [name, provider, resolution, workflow, tier, imageCount, expectedCredits] of CASES) {
    test(`${name} charges ${expectedCredits} credits with at least a 12% margin`, () => {
        const details = getImageCreditDetails(provider, resolution, workflow, tier, imageCount);
        assert.equal(details.credits, expectedCredits);
        const exactRevenue = details.credits * VEILPIX_CREDIT_USD;
        const realizedMargin = (exactRevenue - details.costUsd) / exactRevenue;
        assert.ok(realizedMargin + 0.0001 >= TARGET_MARGIN, `${name} margin was ${realizedMargin}`);
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

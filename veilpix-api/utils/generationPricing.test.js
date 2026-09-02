const assert = require('node:assert/strict');
const test = require('node:test');
const policy = require('../config/generationPricing.json');
const loadRoute = require('./testing/loadPricingRoute');
const { getImageCreditCost, getImageKieCreditCost, getAllowedImageResolutions } = require('./imageCreditPricing');
const { SEEDANCE_PRICING, estimateSeedanceKieCredits, estimateSeedanceVeilPixCredits, buildSeedanceRequest } = require('./seedanceAdapter');
const wan = loadRoute('wan', ['getVideoCreditCost', 'normalizeVideoDuration', 'getVideoPricingTable', 'deductCreditAndTrack']);

function assertMargins(credits, costUsd) {
    for (const pack of Object.values(policy.creditPackages)) {
        const revenue = credits * pack.priceUsd / pack.credits;
        const packFee = Math.round((pack.priceUsd * policy.stripePercentageFee + policy.stripeFixedFeeUsd) * 100) / 100;
        const margin = (revenue - credits * packFee / pack.credits - costUsd) / revenue;
        assert.ok(margin + 1e-10 >= pack.targetMargin, `${credits} credits, $${costUsd}, ${pack.credits}-pack margin ${margin}`);
    }
}

test('margin policy matches the unchanged live checkout package configuration', () => {
    const { CREDIT_PACKAGES } = loadRoute('checkout', ['CREDIT_PACKAGES']);
    for (const [key, pack] of Object.entries(CREDIT_PACKAGES)) {
        assert.equal(policy.creditPackages[key].credits, pack.credits);
        assert.equal(policy.creditPackages[key].priceUsd, pack.priceUsd);
    }
    assert.deepEqual(Object.keys(CREDIT_PACKAGES), Object.keys(policy.creditPackages));
});

test('all image resolutions, workflows, tiers and input counts meet after-fee margins', () => {
    for (const provider of ['nanobanana2', 'seedream', 'wanimage']) {
        for (const tier of ['lite', 'pro']) for (const workflow of ['text-to-image', 'image-to-image']) {
            for (const resolution of getAllowedImageResolutions(provider, workflow, tier)) for (let count = 0; count <= 14; count++) {
                const args = [provider, resolution, workflow, tier, count];
                const cost = getImageKieCreditCost(...args) * 0.005;
                const rawPrevious = cost / (0.0699 * 0.88);
                const previous = rawPrevious < 1 ? Math.ceil(rawPrevious * 100) / 100 : Math.ceil(rawPrevious);
                const credits = getImageCreditCost(...args);
                assert.ok(credits + 1e-10 >= previous * 1.1);
                assertMargins(credits, cost);
            }
        }
    }
});

for (const provider of ['nanobanana2', 'seedream', 'wanimage']) {
    test(`${provider} applies the new fractional price to all five image endpoints`, async () => {
        const charges = [];
        let balance = 100;
        const deductHelper = provider === 'nanobanana2' ? 'deductCreditsAndTrack' : 'deductCreditAndTrack';
        const loaded = loadRoute(provider, ['checkUserCredits', deductHelper], {
            db: {
                async getUserCredits() { return { credits: balance }; },
                async deductUserCredits(_user, amount) { charges.push(amount); return { success: true }; }
            }
        });
        for (const url of ['/generate-edit', '/generate-filter', '/generate-adjust', '/combine-photos', '/generate-text-to-image']) {
            const count = url === '/combine-photos' ? 2 : url === '/generate-text-to-image' ? 0 : 1;
            const req = { path: url, user: { id: 'id', userId: 'user' }, body: { resolution: '2K', seedreamTier: 'lite' },
                file: count === 1 ? {} : undefined, files: count === 2 ? { images: [{}, {}] } : {} };
            let response;
            let status;
            const res = { status(code) { status = code; return this; }, json(data) { response = data; } };
            const workflow = count ? 'image-to-image' : 'text-to-image';
            const expected = getImageCreditCost(provider, '2K', workflow, 'lite', count);
            balance = expected - 0.01;
            await loaded.checkUserCredits(req, res, () => assert.fail('Insufficient balance must stop generation'));
            assert.equal(status, 402);
            assert.equal(response.creditsRequired, expected);
            balance = expected;
            let allowed = false;
            await loaded.checkUserCredits(req, res, () => { allowed = true; });
            assert.equal(allowed, true);
            assert.equal(req.creditsInfo.required, expected);
            assert.equal(await loaded[deductHelper](req, Date.now(), 'test', {}), true);
            assert.equal(charges.at(-1), expected);
            assert.equal(req.creditsInfo.remaining, 0);
        }
        assert.equal(charges.length, 5);
    });
}

test('every Seedance variant, resolution, duration and reference mode increases at least 10%', () => {
    const previousRates = {
        regular: { '480p': [19, 11.5], '720p': [41, 25], '1080p': [102, 62] },
        fast: { '480p': [15.5, 9], '720p': [33, 20] },
        mini: { '480p': [9.5, 6], '720p': [20.5, 12.5] }
    };
    for (const variant of Object.keys(SEEDANCE_PRICING)) for (const resolution of Object.keys(SEEDANCE_PRICING[variant])) {
        for (let duration = 4; duration <= 15; duration++) for (const input of [0, 4, 8.2, 15]) {
            const options = { variant, resolution, duration, hasVideoReference: input > 0, referenceVideoDuration: input };
            const previousKie = Math.ceil(previousRates[variant][resolution][input > 0 ? 1 : 0] * (duration + input));
            const previous = Math.ceil(previousKie * 0.005 / (0.0699 * 0.88));
            const credits = estimateSeedanceVeilPixCredits(options);
            assert.ok(credits + 1e-10 >= previous * 1.1);
            assertMargins(credits, estimateSeedanceKieCredits(options) * 0.005);
            assert.equal(buildSeedanceRequest('Test', options).input.duration, duration);
        }
    }
    assert.equal(estimateSeedanceKieCredits({ variant: 'mini', resolution: '720p', duration: 10 }), 82);
    assert.equal(estimateSeedanceKieCredits({ variant: 'fast', resolution: '720p', duration: 10 }), 248);
});

test('unknown reference durations use the conservative maximum and decimal durations round up', () => {
    const options = { variant: 'regular', resolution: '720p', duration: 5, hasVideoReference: true };
    assert.equal(estimateSeedanceKieCredits(options), 500);
    assert.equal(estimateSeedanceKieCredits({ ...options, referenceVideoDuration: 4.1 }), 250);
});

test('Wan modes meet after-fee margins and quote the normalized provider duration', () => {
    const previous = { 5: { '720p': 7, '1080p': 10 }, 10: { '720p': 13, '1080p': 19 }, 15: { '720p': 19, '1080p': 29 } };
    const textCosts = { 5: { '720p': 70, '1080p': 104.5 }, 10: { '720p': 140, '1080p': 209.5 }, 15: { '720p': 210, '1080p': 315 } };
    for (const mode of ['image', 'text', 'reference']) for (const resolution of ['720p', '1080p']) {
        for (const duration of [2, 5, 8, 10, 15, NaN]) {
            const seconds = wan.normalizeVideoDuration(duration, mode);
            const credits = wan.getVideoCreditCost(duration, resolution, mode);
            const old = previous[seconds]?.[resolution] ?? Math.ceil(seconds * (resolution === '1080p' ? 2 : 1.4));
            assert.ok(credits >= old * 1.1 - 1e-10);
            const cost = mode === 'text' ? textCosts[seconds][resolution] : seconds * (resolution === '1080p' ? 24 : 16);
            assertMargins(credits, cost * 0.005);
            assert.equal(credits, wan.getVideoPricingTable(mode)[seconds][resolution]);
        }
    }
    assert.equal(wan.getVideoCreditCost(5, '720p', 'image'), 9);
    assert.equal(wan.getVideoCreditCost(5, '720p', 'text'), 8);
});

for (const [route, helper] of [['wan', 'deductCreditAndTrack'], ['seedance', 'deductCreditsAndTrack'], ['nanobananapro', 'deductCreditsAndTrack']]) {
    test(`${route} deducts the complete amount once, never on failed generations`, async () => {
        const charges = [];
        const loaded = loadRoute(route, [helper, ...(route === 'nanobananapro' ? ['CREDITS_PER_GENERATION'] : [])], {
            db: { async deductUserCredits(userId, credits) { charges.push({ userId, credits }); return { success: true }; } }
        });
        const req = { user: { id: 'row-id', userId: 'test-user' }, creditsInfo: { remaining: 100 } };
        const amount = route === 'nanobananapro' ? loaded.CREDITS_PER_GENERATION : 23;
        assert.equal(await loaded[helper](req, Date.now(), 'test', amount), true);
        assert.deepEqual(charges, [{ userId: 'test-user', credits: amount }]);
        assert.equal(await loaded[helper](req, Date.now(), 'test', 0, false, 'Provider failed'), true);
        assert.equal(charges.length, 1);
        if (route === 'nanobananapro') {
            assert.equal(amount, 2.69);
            assertMargins(amount, 0.12);
            assert.ok(amount >= 2 * 1.1);
        }
    });
}

for (const [url, mode, fileCount] of [['/generate-video', 'image', 1], ['/generate-text-to-video', 'text', 0], ['/generate-reference-to-video', 'reference', 2]]) {
    test(`Wan ${mode} preflight and successful response charge the displayed price`, async () => {
        const charges = [];
        const calls = [];
        const loaded = loadRoute('wan', [], {
            db: { async deductUserCredits(_user, amount) { charges.push(amount); return { success: true }; } },
            fetch: async (url, options) => {
                if (url.includes('createTask')) calls.push(JSON.parse(options.body));
                return { ok: true, async json() { return { code: 200, data: url.includes('createTask')
                    ? { taskId: 'test-task' }
                    : { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://example.test/output.mp4'] }) } }; } };
            }
        });
        const file = { mimetype: 'image/png', buffer: Buffer.from('test'), size: 4 };
        const req = { user: { id: 'id', userId: 'user' }, body: { prompt: 'Test video', duration: '15', resolution: '720p' },
            file: fileCount === 1 ? file : undefined, files: fileCount === 2 ? { image: [file, file] } : {} };
        let result;
        const res = { status() { return this; }, json(data) { result = data; } };
        const handlers = loaded.routes.get(`POST ${url}`);
        await handlers.at(-2)(req, res, () => {});
        const expected = wan.getVideoCreditCost(15, '720p', mode);
        assert.equal(req.videoCreditCost, expected);
        await handlers.at(-1)(req, res);
        assert.equal(result.success, true, JSON.stringify(result));
        assert.equal(result.creditsUsed, expected);
        assert.deepEqual(charges, [expected]);
        assert.equal(Number(calls[0].input.duration), mode === 'reference' ? 10 : 15);
        assert.equal(calls[0].model, { image: 'wan/2-6-flash-image-to-video', text: 'wan/2-6-text-to-video', reference: 'wan/2-7-r2v' }[mode]);
    });
}

test('a failed atomic video deduction is not reported as a successful charge', async () => {
    const loaded = loadRoute('wan', [], {
        db: { async deductUserCredits() { return { success: false }; } },
        fetch: async (url) => ({ ok: true, async json() { return { code: 200, data: url.includes('createTask')
            ? { taskId: 'test-task' }
            : { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://example.test/output.mp4'] }) } }; } })
    });
    const req = { user: { id: 'id', userId: 'user' }, body: { prompt: 'Test', duration: '5', resolution: '720p' } };
    let status;
    let response;
    const res = { status(code) { status = code; return this; }, json(data) { response = data; } };
    const handlers = loaded.routes.get('POST /generate-text-to-video');
    await handlers.at(-2)(req, res, () => {});
    await handlers.at(-1)(req, res);
    assert.equal(status, 500);
    assert.equal(response.creditsUsed, undefined);
    assert.match(response.message, /Unable to deduct video credits/);
});

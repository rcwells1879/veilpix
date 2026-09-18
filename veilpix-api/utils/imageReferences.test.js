const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { getImageReferenceLimit } = require('./imageReferences');
const nano = require('./nanobanana2Adapter');
const seedream = require('./seedreamAdapter');
const wan = require('./wanImageAdapter');

const cases = [
    ['nanobanana2', 'lite', 14],
    ['seedream', 'lite', 14],
    ['seedream', 'pro', 10],
    ['wanimage', 'lite', 9],
];

for (const [provider, tier, limit] of cases) {
    test(`${provider} ${tier}: multipart accepts the full limit in order and rejects excess inputs`, async (t) => {
        assert.equal(getImageReferenceLimit(provider, tier), limit);
        const router = require(`../routes/${provider}`);
        const route = router.stack.find(layer => layer.route?.path === '/combine-photos').route;
        const app = express();
        // Exercise the actual parser and count validator without credits,
        // authentication, temporary storage, or a paid provider call.
        app.post('/', ...route.stack.slice(0, 2).map(layer => layer.handle), (req, res) => {
            res.json(req.files.images.map(file => file.originalname));
        });
        app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
        const server = app.listen(0, '127.0.0.1');
        t.after(() => new Promise(resolve => server.close(resolve)));
        await once(server, 'listening');
        const url = `http://127.0.0.1:${server.address().port}/`;
        for (const count of [0, 1, 2, limit, limit + 1]) {
            const form = new FormData();
            form.append('seedreamTier', tier);
            const names = Array.from({ length: count }, (_, i) => `input-${i + 1}.png`);
            names.forEach(name => form.append('images', new Blob(['fixture'], { type: 'image/png' }), name));
            const response = await fetch(url, { method: 'POST', body: form });
            assert.equal(response.status, count >= 2 && count <= limit ? 200 : 400, `count ${count}`);
            if (response.ok) assert.deepEqual(await response.json(), names);
        }
    });

    test(`${provider} ${tier}: provider payload retains order and the user's edit intent`, () => {
        const urls = Array.from({ length: limit }, (_, i) => `https://example.com/image-${i + 1}.png`);
        const prompt = 'Edit Image 1 with the colors from Image 2. Keep the original subject.';
        const request = provider === 'nanobanana2'
            ? nano.buildCombineRequest(urls, prompt, '2K', 'auto', 12, 34)
            : provider === 'seedream'
                ? seedream.buildCombineRequest(urls, prompt, '2K', '1:1', true, tier, 'png', 12, 34)
                : wan.buildCombineRequest(urls, prompt, '2K', 'auto', true, 12, 34);
        assert.deepEqual(request.image_input ?? request.image_urls ?? request.input_urls, urls);
        assert.ok(request.prompt.includes(prompt));
        assert.ok(request.prompt.includes(`Image 1 through Image ${limit}`));
        assert.ok(request.prompt.includes('Image 1 around coordinates (12, 34)'));
        assert.ok(!request.prompt.includes('Combine these images'));
        assert.ok(!request.prompt.includes('natural-looking'));
    });
}

test('Z-Image has no input images', () => {
    assert.equal(getImageReferenceLimit('zimage'), 0);
});

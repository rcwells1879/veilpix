import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const imageApi = require('../veilpix-api/utils/imageCreditPricing.js');
const seedanceApi = require('../veilpix-api/utils/seedanceAdapter.js');
const loadRoute = require('../veilpix-api/utils/testing/loadPricingRoute.js');
const wanApi = loadRoute('wan', ['getVideoCreditCost']);

function loadControl(filename, additionalExports = []) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const compiled = ts.transpileModule(`${source}\nexport { ${additionalExports.join(', ')} };`, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports,
        require: (id) => id.endsWith('generationPricing.json')
            ? require('../veilpix-api/config/generationPricing.json') : {}
    }, { filename });
    return module.exports;
}

const imageUi = loadControl('components/ImageModelControlsPanel.tsx');
const videoUi = loadControl('components/VideoControlsPanel.tsx', ['getWanCreditCost', 'getSeedanceCreditCost']);
let comparisons = 0;

for (const provider of ['nanobanana2', 'seedream', 'wanimage']) {
    for (const tier of ['lite', 'pro']) for (const workflow of ['text-to-image', 'image-to-image']) {
        for (const resolution of imageApi.getAllowedImageResolutions(provider, workflow, tier)) {
            for (let count = 0; count <= 14; count++) {
                const args = [provider, resolution, workflow, tier, count];
                assert.equal(imageUi.getImageCreditCost(...args), imageApi.getImageCreditCost(...args), args.join(' / '));
                comparisons++;
            }
        }
    }
}

for (const variant of Object.keys(seedanceApi.SEEDANCE_PRICING)) {
    for (const resolution of [...Object.keys(seedanceApi.SEEDANCE_PRICING[variant]), 'invalid']) {
        for (const duration of [4, 5, 7.9, 10, 15, 20, NaN]) for (const input of [null, 0, 4.1, 8.9, 15]) {
            for (const hasVideoReference of [false, true]) {
                assert.equal(
                    videoUi.getSeedanceCreditCost(variant, resolution, duration, hasVideoReference, input),
                    seedanceApi.estimateSeedanceVeilPixCredits({ variant, resolution, duration, hasVideoReference, referenceVideoDuration: input }),
                    `Seedance ${variant} ${resolution} ${duration} ${hasVideoReference} ${input}`
                );
                comparisons++;
            }
        }
    }
}

for (const mode of ['image', 'text', 'reference']) for (const resolution of ['720p', '1080p']) {
    for (const duration of [2, 4, 5, 8, 10, 15, NaN]) {
        assert.equal(videoUi.getWanCreditCost(duration, resolution, mode), wanApi.getVideoCreditCost(duration, resolution, mode));
        comparisons++;
    }
}

console.log(`Passed ${comparisons} frontend/backend generation-price comparisons.`);

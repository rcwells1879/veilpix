import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const economics = require('../veilpix-api/utils/creditEconomics.js');
const images = require('../veilpix-api/utils/imageCreditPricing.js');
const seedance = require('../veilpix-api/utils/seedanceAdapter.js');
const wan = require('../veilpix-api/utils/wanAdapter.js');
const wan3 = require('../veilpix-api/utils/wan3Adapter.js');
const assertGenerationPricing = require('../veilpix-api/utils/testing/assertGenerationPricing.js');

// Execute the real browser pricing modules, including their local imports.
const moduleCache = new Map();
function loadBrowserModule(filename) {
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;
  const module = { exports: {} };
  moduleCache.set(filename, module);
  const localRequire = createRequire(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const importModule = (specifier) => {
    if (!specifier.startsWith('.')) return localRequire(specifier);
    const base = path.resolve(path.dirname(filename), specifier);
    const source = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`]
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    assert.ok(source, `Missing browser import ${specifier} from ${filename}`);
    return loadBrowserModule(source);
  };
  vm.runInThisContext(`(function(require, module, exports) {\n${compiled}\n})`, { filename })(
    importModule, module, module.exports
  );
  return module.exports;
}

const browserEconomics = loadBrowserModule(path.join(root, 'src/utils/creditEconomics.ts'));
const browserImages = loadBrowserModule(path.join(root, 'components/ImageModelControlsPanel.tsx'));
const browserVideo = loadBrowserModule(path.join(root, 'components/studio/videoPricing.ts'));
let checked = 0;
function checkPrice(browserPrice, serverPrice, kieCredits, label) {
  assert.equal(browserPrice, serverPrice, `${label}: browser/server price mismatch`);
  assertGenerationPricing(serverPrice, kieCredits * economics.KIE_CREDIT_USD, label);
  checked += 1;
}

assert.equal(browserEconomics.BILLABLE_USD_PER_VEILPIX_CREDIT, economics.BILLABLE_USD_PER_VEILPIX_CREDIT);
assert.equal(browserEconomics.TARGET_MARGIN, economics.TARGET_MARGIN);
for (let index = 1; index <= 2000; index += 1) {
  const kieCredits = index / 7;
  checkPrice(browserEconomics.veilpixCreditsFromKieCredits(kieCredits),
    economics.veilpixCreditsFromKieCredits(kieCredits), kieCredits, `Conversion ${kieCredits}`);
}

for (const provider of browserImages.IMAGE_PROVIDER_OPTIONS) {
  for (const workflow of Object.values(images.IMAGE_WORKFLOWS)) {
    if (!browserImages.imageProviderSupportsWorkflow(provider, workflow)) continue;
    for (const tier of provider === 'seedream' ? ['lite', 'pro'] : ['lite']) {
      for (const { value: resolution } of browserImages.getImageModelResolutions(provider, workflow, tier)) {
        for (const count of workflow === 'image-to-image' ? [1, 2, 3, 8] : [0]) {
          const args = [provider, resolution, workflow, tier, count];
          checkPrice(browserImages.getImageCreditCost(...args), images.getImageCreditCost(...args),
            images.getImageKieCreditCost(...args), args.join(' '));
        }
      }
    }
  }
}

for (const usesReferenceToVideo of [false, true]) {
  const durations = usesReferenceToVideo ? browserVideo.WAN_27_DURATIONS : browserVideo.WAN_26_DURATIONS;
  for (const duration of durations) {
    for (const resolution of browserVideo.WAN_RESOLUTIONS) {
      const context = { duration, resolution, usesReferenceToVideo };
      checkPrice(browserVideo.getWanCreditCost(duration, resolution, usesReferenceToVideo),
        wan.estimateWanVeilPixCredits(context), wan.estimateWanKieCredits(context), JSON.stringify(context));
    }
  }
}

for (const variant of browserVideo.SEEDANCE_VARIANTS) {
  const limits = browserVideo.SEEDANCE_DURATION_LIMITS[variant];
  const durations = Array.from({ length: limits.max - limits.min + 1 }, (_, index) => index + limits.min);
  if (variant === 'v2_5') durations.push(-1);
  for (const resolution of browserVideo.SEEDANCE_RESOLUTIONS[variant]) {
    for (const duration of durations) {
      for (const referenceVideoDuration of [0, 5.25, limits.max]) {
        const hasVideoReference = referenceVideoDuration > 0;
        const context = { variant, resolution, duration, hasVideoReference, referenceVideoDuration };
        checkPrice(browserVideo.getSeedanceCreditCost(variant, resolution, duration, hasVideoReference, referenceVideoDuration),
          seedance.estimateSeedanceVeilPixCredits(context), seedance.estimateSeedanceKieCredits(context), JSON.stringify(context));
      }
    }
  }
}

for (const variant of Object.keys(wan3.WAN3_PRICING)) {
  for (const resolution of browserVideo.WAN3_RESOLUTIONS) {
    for (const duration of [-1, ...Array.from({ length: 29 }, (_, index) => index + 2)]) {
      for (const referenceVideoDuration of [0, 6.25, 15]) {
        const hasVideoReference = referenceVideoDuration > 0;
        const context = { variant, resolution, duration, hasVideoReference, referenceVideoDuration };
        checkPrice(browserVideo.getWan3CreditCost(variant, resolution, duration, hasVideoReference, referenceVideoDuration),
          wan3.estimateWan3VeilPixCredits(context), wan3.estimateWan3KieCredits(context), JSON.stringify(context));
      }
    }
  }
}

console.log(`Passed ${checked} browser/API price, minimum increase, and package margin checks.`);

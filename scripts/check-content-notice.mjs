import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = filename => fs.readFileSync(new URL(filename, root), 'utf8');

function loadTypeScript(filename, declarationNames) {
  const source = read(filename);
  let input = source;
  if (declarationNames) {
    // Test the existing App error helpers without mounting authenticated app state.
    const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = parsed.statements.filter(statement => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some(declaration => declarationNames.includes(declaration.name.getText(parsed))));
    assert.equal(declarations.length, declarationNames.length);
    input = `${declarations.map(statement => statement.getText(parsed)).join('\n')}\nmodule.exports = { ${declarationNames.join(', ')} };`;
  }
  const compiled = ts.transpileModule(input, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { require, module, exports: module.exports }, { filename });
  return module.exports;
}

const { ContentPolicyNotice } = loadTypeScript('components/ContentPolicyNotice.tsx');
const { default: FAQ } = loadTypeScript('components/FAQ.tsx');
const errors = loadTypeScript('App.tsx', [
  'CONTENT_POLICY_ERROR_CODE', 'CONTENT_POLICY_ERROR_MESSAGE', 'getApiErrorMessage',
  'isSafetyFilterError', 'getGenerationErrorMessage',
]);

const states = [
  { label: 'before purchase', hasPurchasedCredits: false, nsfwFilterEnabled: true },
  { label: 'purchased with filter enabled', hasPurchasedCredits: true, nsfwFilterEnabled: true },
  { label: 'After Dark enabled', hasPurchasedCredits: true, nsfwFilterEnabled: false },
];

for (const state of states) {
  test(`content notice: ${state.label} includes Terms and appropriate guidance`, () => {
    const html = renderToStaticMarkup(React.createElement(ContentPolicyNotice, state));
    assert.match(html, /href="\/veilpix\/terms\/" target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /Terms of Service/);
    assert.match(html, /non-consensual intimate/);
    if (!state.hasPurchasedCredits) {
      assert.match(html, /18\+, complete age verification, and purchase credits/);
      assert.match(html, /Settings and enable VeilPix After Dark/);
    } else if (state.nsfwFilterEnabled) {
      assert.match(html, /open Settings and enable VeilPix After Dark/);
      assert.doesNotMatch(html, /purchase credits/);
    } else {
      assert.match(html, /already enabled/);
      assert.match(html, /restrictions that cannot be disabled/);
      assert.doesNotMatch(html, /open Settings|purchase credits/);
    }
  });
}

test('a non-purchaser with a stale disabled filter still sees the eligibility requirements', () => {
  const html = renderToStaticMarkup(React.createElement(ContentPolicyNotice, {
    hasPurchasedCredits: false, nsfwFilterEnabled: false,
  }));
  assert.match(html, /complete age verification, and purchase credits/);
  assert.doesNotMatch(html, /already enabled/);
});

test('the public FAQ and machine-readable pages no longer advertise After Dark', () => {
  const faqHtml = renderToStaticMarkup(React.createElement(FAQ));
  const index = read('index.html');
  for (const content of [faqHtml, index, read('public/llms.txt')]) {
    assert.doesNotMatch(content, /After Dark|NSFW AI|18\+ AI|adult AI creative/i);
  }
  const schemas = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const faq = schemas.find(schema => schema['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 11);
  for (const question of faq.mainEntity) assert.ok(faqHtml.includes(question.name), question.name);
  assert.ok(fs.existsSync(new URL('public/terms/index.html', root)));
});

test('provider content-policy denials still select the contextual warning', () => {
  for (const error of [
    { data: { code: 'CONTENT_POLICY_VIOLATION', message: 'Request rejected' } },
    new Error('NSFW content detected'),
    new Error('OutputVideoSensitiveContentDetected'),
    new Error('This request was flagged by the content moderation provider.'),
  ]) {
    assert.equal(errors.isSafetyFilterError(error), true);
    assert.equal(errors.getGenerationErrorMessage(error, 'Generation failed.'), errors.CONTENT_POLICY_ERROR_MESSAGE);
  }
});

test('ordinary server and network errors do not show adult-content or purchase guidance', () => {
  for (const message of ['Internal Error', 'HTTP 500', 'Failed to fetch', 'Temporary storage unavailable']) {
    assert.equal(errors.isSafetyFilterError(new Error(message)), false);
    assert.equal(errors.getGenerationErrorMessage(new Error(message), 'Generation failed.'), `Generation failed. ${message}`);
  }
});

// Optional static fixture for desktop/mobile visual checks, without paid generations.
if (process.env.CONTENT_NOTICE_PREVIEW) {
  const built = read('dist/index.html');
  const css = built.match(/<style data-veilpix-entry-css>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(css, 'Build the frontend before generating the visual fixture.');
  const notices = states.map(state => `<section class="glass-panel edge mx-auto mb-6 w-full max-w-3xl rounded-2xl p-4">
    <h2 class="mb-3 text-sm font-semibold text-amber-200">${state.label}</h2>
    ${renderToStaticMarkup(React.createElement(ContentPolicyNotice, state))}</section>`).join('');
  fs.writeFileSync(process.env.CONTENT_NOTICE_PREVIEW, `<!doctype html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>VeilPix content notice preview</title>
    <style>${css}</style></head><body class="p-4 text-gray-100">${notices}${renderToStaticMarkup(React.createElement(FAQ))}</body></html>`);
  console.log(`Visual fixture: ${fileURLToPath(new URL(process.env.CONTENT_NOTICE_PREVIEW, 'file:///'))}`);
}

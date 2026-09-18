import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real client with auth hooks and fetch replaced; no network calls.
const source = fs.readFileSync(new URL('../src/services/apiClient.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(
  source.replace('import.meta.env.VITE_API_BASE_URL', JSON.stringify('https://api.veilpix.test')),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;

function createHarness() {
  const requests = [];
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: specifier => {
      assert.ok(['react', '@clerk/clerk-react'].includes(specifier), `Unexpected dependency: ${specifier}`);
      return {};
    },
    console: { log() {}, error() {} },
    Headers,
    FormData,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    },
  }, { filename: 'apiClient.js' });
  return {
    requests,
    client: module.exports.createApiClient(async () => 'fresh-test-token', 'client-session'),
  };
}

for (const [format, makeHeaders] of [
  ['object', entries => Object.fromEntries(entries)],
  ['Headers', entries => new Headers(entries)],
  ['tuples', entries => entries],
]) {
  for (const multipart of [false, true]) {
    test(`${format} headers preserve recovery IDs, auth and ${multipart ? 'multipart boundaries' : 'JSON content type'}`, async () => {
      const { client, requests } = createHarness();
      const headers = makeHeaders([
        ['X-Generation-ID', 'generation-123'],
        ['aUtHoRiZaTiOn', 'Bearer stale-token'],
        ['x-session-id', 'stale-session'],
      ]);
      const originalHeaders = [...new Headers(headers)];
      const body = multipart ? new FormData() : JSON.stringify({ prompt: 'Test' });
      if (multipart) body.append('prompt', 'Test');

      assert.deepEqual(await client.apiRequest('/test', {
        method: 'POST', headers, body, requiresAuth: true,
      }), { success: true });

      assert.equal(requests.length, 1);
      const request = requests[0];
      const sentHeaders = new Headers(request.headers);
      assert.equal(request.url, 'https://api.veilpix.test/test');
      assert.equal(request.body, body);
      assert.equal(sentHeaders.get('X-Generation-ID'), 'generation-123');
      assert.equal(sentHeaders.get('Authorization'), 'Bearer fresh-test-token');
      assert.equal(sentHeaders.get('X-Session-ID'), 'client-session');
      assert.equal(sentHeaders.get('Content-Type'), multipart ? null : 'application/json');
      assert.deepEqual([...new Headers(headers)], originalHeaders, 'Caller headers must not be mutated');
    });
  }
}

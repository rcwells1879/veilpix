import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual mutation functions with network/auth hooks replaced.
// Provider calls and credit deductions never run in this contract check.
let captured;
const mocks = {
  react: {},
  '@clerk/clerk-react': {},
  '@tanstack/react-query': { useMutation: options => options },
  '../services/apiClient': { useApiClient: () => ({ apiRequest: async (url, options) => { captured = { url, ...options }; return { success: true }; } }) },
  '../queryClient': { queryClient: { invalidateQueries() {} } },
  '../utils/imageCompression': {
    compressMultipleImages: async files => Promise.all(files.map(async (file, i) => {
      // Deliberately finish compression out of input order.
      await new Promise(resolve => setTimeout(resolve, files.length - i));
      return file;
    })),
  },
};
const fileName = new URL('../src/hooks/useImageGeneration.ts', import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(fileName, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
vm.runInThisContext(`(function(require, module, exports) { ${compiled}\n})`)(specifier => {
  assert.ok(Object.hasOwn(mocks, specifier), `Unexpected dependency: ${specifier}`);
  return mocks[specifier];
}, module, module.exports);

for (const [hook, provider, count, seedreamTier] of [
  ['useGenerateCompositeNanoBanana2', 'nanobanana2', 14, 'lite'],
  ['useGenerateCompositeSeeDream', 'seedream', 14, 'lite'],
  ['useGenerateCompositeSeeDream', 'seedream', 10, 'pro'],
  ['useGenerateCompositeWanImage', 'wanimage', 9, 'lite'],
]) {
  const images = Array.from({ length: count }, (_, i) => new File([`image ${i + 1}`], `${i + 1}.png`, { type: 'image/png' }));
  await module.exports[hook]().mutationFn({ images, prompt: 'Edit Image 1 using Image 3.', generationId: 'test-generation', x: 12, y: 34, seedreamTier, resolution: '2K', aspectRatio: '1:1', outputFormat: 'jpeg', nsfwFilterEnabled: true });
  assert.equal(captured.url, `/api/${provider}/combine-photos`);
  assert.deepEqual(captured.body.getAll('images').map(file => file.name), images.map(file => file.name));
  assert.equal(captured.body.get('prompt'), 'Edit Image 1 using Image 3.');
  assert.equal(captured.body.get('x'), '12');
  assert.equal(captured.body.get('y'), '34');
  assert.equal(captured.headers['X-Generation-ID'], 'test-generation');
  assert.equal(captured.requiresAuth, true);
  if (provider === 'seedream') {
    assert.equal(captured.body.get('seedreamTier'), seedreamTier);
    assert.equal(captured.body.get('outputFormat'), 'jpeg');
  }
}
console.log('Passed ordered multipart request checks for all four image-model variants, including retouch coordinates and recovery IDs.');

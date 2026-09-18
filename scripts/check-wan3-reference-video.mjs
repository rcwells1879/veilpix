import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// Match the CommonJS loader used for the transpiled browser module.
const { BlobSource, BufferTarget, Conversion, EncodedPacketSink, Input, MP4, Mp4OutputFormat, Output } = createRequire(import.meta.url)('mediabunny');

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = new File([fs.readFileSync(new URL('./fixtures/wan3-reference-overrun.mp4', import.meta.url))], 'generated-15s.mp4', { type: 'video/mp4' });
function loadModule(relativePath, mocks = {}) {
  const filename = path.resolve(root, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, File, FormData, console,
    fetch: mocks.fetch,
    require: specifier => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.')) return loadModule(path.resolve(path.dirname(filename), `${specifier}.ts`), mocks);
      return localRequire(specifier);
    },
  }, { filename });
  return module.exports;
}
const { prepareWan3ReferenceVideos } = loadModule('src/utils/wan3ReferenceVideo.ts');
const open = file => new Input({ source: new BlobSource(file), formats: [MP4] });

async function shorterFixture(end, name = 'shorter.mp4') {
  const input = open(fixture);
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  try {
    const conversion = await Conversion.init({ input, output, trim: { end }, copy: { mode: 'forced', boundaryPolicy: 'shrink' } });
    assert.equal(conversion.isValid, true);
    await conversion.execute();
    return new File([output.target.buffer], name, { type: 'video/mp4' });
  } finally { input.dispose(); }
}

test('a real 15.208s H.264/AAC file is shortened below 15s without re-encoding either track', async () => {
  const result = await prepareWan3ReferenceVideos([fixture]);
  assert.notEqual(result.files[0], fixture);
  assert.ok(result.duration >= 14.7 && result.duration < 15);
  const before = open(fixture);
  const after = open(result.files[0]);
  try {
    assert.ok(await before.computeDuration() > 15);
    assert.ok(await after.computeDuration() < 15);
    assert.ok(await after.getDurationFromMetadata() < 15);
    const sourceTracks = await before.getTracks();
    const outputTracks = await after.getTracks();
    assert.equal(outputTracks.length, 2, 'Both video and audio must survive');
    const hash = packet => createHash('sha256').update(packet.data).digest('hex');
    for (let i = 0; i < outputTracks.length; i++) {
      const sourcePackets = new Set();
      for await (const packet of new EncodedPacketSink(sourceTracks[i]).packets()) sourcePackets.add(hash(packet));
      let packetCount = 0;
      for await (const packet of new EncodedPacketSink(outputTracks[i]).packets()) {
        assert.ok(sourcePackets.has(hash(packet)), 'Encoded packet bytes must match the original');
        assert.ok(packet.timestamp + packet.duration < 15);
        packetCount++;
      }
      assert.ok(packetCount > 0);
    }
  } finally { before.dispose(); after.dispose(); }
  if (process.env.WAN3_QA_OUTPUT) fs.writeFileSync(process.env.WAN3_QA_OUTPUT, Buffer.from(await result.files[0].arrayBuffer()));
});

test('valid shorter videos keep the original file and bytes', async () => {
  const file = await shorterFixture(10);
  const result = await prepareWan3ReferenceVideos([file]);
  assert.equal(result.files[0], file);
  assert.ok(result.duration <= 10);
});

test('small combined overruns are trimmed while preserving reference order', async () => {
  const first = await shorterFixture(7.6, 'first.mp4');
  const second = await shorterFixture(7.6, 'second.mp4');
  const result = await prepareWan3ReferenceVideos([first, second]);
  assert.equal(result.files.length, 2);
  assert.ok(result.duration <= 15 && result.duration >= 14.7);
  assert.match(result.files[0].name, /^first/);
  assert.equal(result.files[1], second);
});

test('genuinely excessive totals and clips under one second are rejected', async () => {
  const tenSeconds = await shorterFixture(10);
  await assert.rejects(prepareWan3ReferenceVideos([tenSeconds, tenSeconds]), /must total 15 seconds/);
  await assert.rejects(prepareWan3ReferenceVideos([await shorterFixture(0.5)]), /at least 1 second/);
  await assert.rejects(prepareWan3ReferenceVideos(Array(6).fill(tenSeconds)), /up to five/);
});

test('malformed files fail before upload', async () => {
  await assert.rejects(prepareWan3ReferenceVideos([new File(['invalid'], 'broken.mp4')]), /Could not read reference video/);
});

test('the WAN mutation signs and uploads prepared bytes and submits the measured duration', async () => {
  const requests = [];
  const uploads = [];
  const hooks = loadModule('src/hooks/useImageGeneration.ts', {
    '@tanstack/react-query': { useMutation: options => options },
    '../queryClient': { queryClient: { invalidateQueries() {} } },
    '../utils/imageCompression': {},
    '../services/apiClient': { useApiClient: () => ({ apiRequest: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      if (url.endsWith('/inputs/sign')) return { uploads: body.files.map((file, i) => ({ ...file, objectPath: `test/${i}`, signedUrl: `https://upload.test/${i}` })) };
      return { success: true, pending: true };
    } }) },
    fetch: async (url, options) => { uploads.push({ url, ...options }); return { ok: true }; },
  });
  await hooks.useGenerateWan3Video().mutationFn({
    prompt: 'Continue Video1', generationId: 'test-generation', variant: 'standard', inputMode: 'references',
    duration: 15, resolution: '720P', aspectRatio: '16:9', referenceVideos: [fixture], referenceVideoDuration: 15,
  });
  assert.equal(requests.length, 2);
  assert.equal(uploads.length, 1);
  assert.notEqual(uploads[0].body, fixture);
  assert.equal(requests[0].body.files[0].size, uploads[0].body.size);
  assert.equal(requests[0].body.files[0].mimeType, 'video/mp4');
  assert.ok(requests[1].body.referenceVideoDuration < 15);
  assert.equal(requests[1].body.uploads.referenceVideos[0].size, uploads[0].body.size);
  requests.length = 0;
  await assert.rejects(hooks.useGenerateWan3Video().mutationFn({ referenceVideos: [fixture, fixture] }), /must total 15 seconds/);
  assert.equal(requests.length, 0, 'Invalid clips must fail before signing or creating a paid job');
});

import assert from 'node:assert/strict';
import { File, Blob } from 'node:buffer';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
function loadModule(relativePath) {
  const filename = path.resolve(root, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, File, Blob, console,
    require: specifier => specifier.startsWith('.') ? loadModule(path.resolve(path.dirname(filename), `${specifier}.ts`)) : localRequire(specifier),
  }, { filename });
  return module.exports;
}
const { boundaryAtFraction, boundaryFraction, initialTrimRange, moveTrimBoundary, nearestBoundary, preciseTimecode, retainedRanges, trimTimes } = loadModule('components/studio/videoTrimRange.ts');
const { readVideoTimeline, removeVideoSection, boundAudioToVideo } = loadModule('src/utils/videoTrim.ts');
const fixture = new File([fs.readFileSync(new URL('./fixtures/video-cut.mp4', import.meta.url))], 'video-cut.mp4', { type: 'video/mp4' });
const plain = value => JSON.parse(JSON.stringify(value));

test('a center cut retains both sides and uses an exclusive end', () => {
  const timeline = { boundaries: [0, 0.04, 0.1, 0.14, 0.2, 0.3] };
  assert.deepEqual(plain(retainedRanges(timeline, { start: 1, end: 3 })), [{ start: 0, end: 1 }, { start: 3, end: 5 }]);
  const kept = retainedRanges(timeline, { start: 1, end: 3 }).map(range => trimTimes(timeline, range));
  assert.equal(kept.reduce((sum, range) => sum + range.frameCount, 0), 3);
  assert.ok(Math.abs(kept.reduce((sum, range) => sum + range.duration, 0) - 0.2) < 1e-10);
  assert.deepEqual(plain(retainedRanges(timeline, { start: 0, end: 2 })), [{ start: 2, end: 5 }]);
  assert.deepEqual(plain(retainedRanges(timeline, { start: 3, end: 5 })), [{ start: 0, end: 3 }]);
  assert.throws(() => retainedRanges(timeline, { start: 0, end: 5 }), /at least one frame/);
  assert.throws(() => trimTimes(timeline, { start: 2, end: 2 }), /at least one video frame/);
});

test('variable-rate timeline geometry is proportional to time, and every frame boundary round-trips', () => {
  const timeline = { boundaries: [0.05, 0.09, 0.13, 0.3, 0.8, 1.05] };
  for (let index = 0; index < timeline.boundaries.length; index++) assert.equal(boundaryAtFraction(timeline, boundaryFraction(timeline, index)), index);
  assert.equal(boundaryFraction(timeline, 4), 0.75);
  assert.equal(boundaryAtFraction(timeline, -1), 0);
  assert.equal(boundaryAtFraction(timeline, 2), 5);
  assert.equal(nearestBoundary(timeline, 0.79), 4);
  assert.deepEqual(plain(moveTrimBoundary(timeline, { start: 1, end: 3 }, 'start', 5)), { start: 2, end: 3 });
  assert.deepEqual(plain(moveTrimBoundary(timeline, { start: 1, end: 3 }, 'end', -1)), { start: 1, end: 2 });
  assert.deepEqual(plain(initialTrimRange({ boundaries: [0, 1, 2] })), { start: 0, end: 1 });
  assert.equal(preciseTimecode(59.9996), '1:00.000');
});

test('real H.264 B-frame input is indexed by presentation time, with all 96 frames', async () => {
  const timeline = await readVideoTimeline(fixture);
  assert.equal(timeline.boundaries.length, 97);
  assert.equal(timeline.boundaries[0], 0);
  assert.equal(timeline.boundaries.at(-1), 4);
  timeline.boundaries.forEach((time, index) => assert.ok(Math.abs(time - index / 24) < 0.000001));
  assert.equal(trimTimes(timeline, { start: 13, end: 61 }).duration, 2);
});

test('audio padding is bounded without changing the video frame timeline', async () => {
  const result = await boundAudioToVideo(fixture, 4);
  assert.deepEqual(plain(await readVideoTimeline(result)), plain(await readVideoTimeline(fixture)));
  const { Input, BlobSource, MP4 } = createRequire(import.meta.url)('mediabunny');
  const input = new Input({ source: new BlobSource(result), formats: [MP4] });
  try { assert.equal((await input.getAudioTracks()).length, 1); assert.ok(await input.computeDuration() <= 4.000001); }
  finally { input.dispose(); }
});

test('a real variable-rate file keeps unequal frame intervals and accurate cut duration', async () => {
  const file = new File([fs.readFileSync(new URL('./fixtures/video-cut-vfr.mp4', import.meta.url))], 'vfr.mp4');
  const timeline = await readVideoTimeline(file);
  assert.equal(timeline.boundaries.length - 1, 77);
  const intervals = timeline.boundaries.slice(1).map((time, i) => time - timeline.boundaries[i]);
  assert.ok(intervals.some(duration => duration > 0.08));
  assert.ok(intervals.some(duration => duration < 0.05));
  const kept = retainedRanges(timeline, { start: 9, end: 39 }).map(range => trimTimes(timeline, range));
  assert.equal(kept.reduce((sum, range) => sum + range.frameCount, 0), 47);
  assert.ok(Math.abs(kept.reduce((sum, range) => sum + range.duration, 0) - 2.416667) < 0.000001);
});

test('whole-clip removal, invalid data, and unavailable browser codecs fail explicitly', async () => {
  const timeline = await readVideoTimeline(fixture);
  await assert.rejects(removeVideoSection(fixture, timeline, { start: 0, end: 96 }), /entire video/);
  await assert.rejects(readVideoTimeline(new Blob(['invalid'])), /./);
  await assert.rejects(removeVideoSection(fixture, timeline, { start: 13, end: 61 }), /browser cannot decode/);
});

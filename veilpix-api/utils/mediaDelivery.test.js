const test = require('node:test');
const assert = require('node:assert/strict');
const {
    artifactTypeFromResult,
    parseSerializedGenerationResult
} = require('./mediaDelivery');

test('recognizes every staged media artifact type', () => {
    assert.equal(artifactTypeFromResult({ imageUrl: 'https://example.com/a.png' }).artifactType, 'image');
    assert.equal(artifactTypeFromResult({ videoUrl: 'https://example.com/a.mp4' }).artifactType, 'video');
    assert.equal(artifactTypeFromResult({ audioUrl: 'https://example.com/a.mp3' }).artifactType, 'audio');
    assert.equal(artifactTypeFromResult({ fileUrl: 'https://example.com/a.pdf' }).artifactType, 'file');
});

test('parses serialized generation results and rejects non-results', () => {
    const parsed = parseSerializedGenerationResult(JSON.stringify({ videoUrl: 'https://example.com/a.mp4', creditsUsed: 4 }));
    assert.equal(parsed.artifactType, 'video');
    assert.equal(parsed.result.creditsUsed, 4);
    assert.equal(parseSerializedGenerationResult('provider failed'), null);
});

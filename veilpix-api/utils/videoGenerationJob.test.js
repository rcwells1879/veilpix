const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeVideoGenerationId,
    serializeVideoGenerationResult,
    videoGenerationJobResponse
} = require('./videoGenerationJob');

test('normalizes valid client generation IDs and rejects arbitrary values', () => {
    assert.equal(
        normalizeVideoGenerationId('550E8400-E29B-41D4-A716-446655440000'),
        '550e8400-e29b-41d4-a716-446655440000'
    );
    assert.equal(normalizeVideoGenerationId('not-a-job-id'), null);
});

test('returns a recoverable successful video result', () => {
    const record = {
        success: true,
        error_message: serializeVideoGenerationResult('https://example.com/video.mp4', 14),
        processing_time_ms: 162000
    };

    assert.deepEqual(videoGenerationJobResponse(record), {
        status: 'succeeded',
        videoUrl: 'https://example.com/video.mp4',
        creditsUsed: 14,
        processingTime: 162000
    });
});

test('distinguishes pending and failed video jobs', () => {
    assert.deepEqual(videoGenerationJobResponse(null), { status: 'pending' });
    assert.deepEqual(videoGenerationJobResponse({ success: false, error_message: 'Provider rejected the video' }), {
        status: 'failed',
        message: 'Provider rejected the video'
    });
});

test('keeps staged private deliveries pending until the browser acknowledges them', () => {
    assert.deepEqual(videoGenerationJobResponse({
        success: true,
        error_message: JSON.stringify({ deliveryId: 'delivery-1', creditsUsed: 4 }),
        processing_time_ms: 42000
    }), {
        status: 'pending',
        deliveryId: 'delivery-1',
        creditsUsed: 4,
        processingTime: 42000
    });
});

test('does not report an error when delivery acknowledgement races a recovery poll', () => {
    assert.deepEqual(videoGenerationJobResponse({
        success: true,
        error_message: JSON.stringify({ delivered: true })
    }), {
        status: 'pending',
        delivered: true
    });
});

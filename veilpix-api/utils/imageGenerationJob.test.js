const test = require('node:test');
const assert = require('node:assert/strict');
const {
    firstImageUrl,
    serializeImageGenerationResult,
    imageGenerationJobResponse
} = require('./imageGenerationJob');

test('extracts image URLs from Kie result formats', () => {
    assert.equal(firstImageUrl({ resultUrls: ['https://cdn.example/image.png'] }), 'https://cdn.example/image.png');
    assert.equal(
        firstImageUrl({ data: { resultJson: JSON.stringify({ resultUrls: ['https://cdn.example/nested.png'] }) } }),
        'https://cdn.example/nested.png'
    );
});

test('serializes and restores a successful image job', () => {
    const error_message = serializeImageGenerationResult({ resultUrls: ['https://cdn.example/image.png'] }, 2);
    assert.deepEqual(imageGenerationJobResponse({
        success: true,
        error_message,
        processing_time_ms: 1234
    }), {
        status: 'succeeded',
        imageUrl: 'https://cdn.example/image.png',
        creditsUsed: 2,
        processingTime: 1234
    });
});

test('returns pending and failed image job states', () => {
    assert.deepEqual(imageGenerationJobResponse(null), { status: 'pending' });
    assert.deepEqual(imageGenerationJobResponse({ success: false, error_message: 'Provider rejected the image' }), {
        status: 'failed',
        message: 'Provider rejected the image'
    });
});

test('keeps staged private image deliveries pending until browser storage is verified', () => {
    assert.deepEqual(imageGenerationJobResponse({
        success: true,
        error_message: JSON.stringify({ deliveryId: 'delivery-2', creditsUsed: 2 }),
        processing_time_ms: 1200
    }), {
        status: 'pending',
        deliveryId: 'delivery-2',
        creditsUsed: 2,
        processingTime: 1200
    });
});

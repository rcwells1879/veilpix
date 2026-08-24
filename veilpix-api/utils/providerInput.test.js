const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createProviderInputRelayUrl,
    userInputPrefix
} = require('./providerInput');
const { isValidProviderMediaSignature } = require('./providerMediaUrl');

test('creates a signed provider-input relay without exposing a Storage URL', () => {
    const clerkUserId = 'user_test_123';
    const objectPath = `${userInputPrefix(clerkUserId)}/123e4567-e89b-42d3-a456-426614174000/0-reference.png`;
    const url = new URL(createProviderInputRelayUrl(clerkUserId, { objectPath }, {
        baseUrl: 'https://api.example.com/api/provider-input',
        signingSecret: 'test-signing-secret',
        ttlSeconds: 2700,
        nowMs: 1_700_000_000_000
    }));
    const token = decodeURIComponent(url.pathname.split('/').pop());

    assert.equal(url.origin, 'https://api.example.com');
    assert.equal(Buffer.from(token, 'base64url').toString('utf8'), objectPath);
    assert.equal(isValidProviderMediaSignature(
        token,
        url.searchParams.get('expires'),
        url.searchParams.get('signature'),
        { signingSecret: 'test-signing-secret', nowMs: 1_700_000_000_000 }
    ), true);
});

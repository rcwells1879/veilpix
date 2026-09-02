const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createProviderMediaUrl,
    isValidProviderMediaSignature
} = require('./providerMediaUrl');

const filename = '1787350000000_0123456789abcdef.png';
const signingSecret = 'provider-media-test-secret';
const nowMs = 1_787_350_000_000;

test('creates a short-lived provider media URL with a valid signature', () => {
    const url = new URL(createProviderMediaUrl(filename, {
        baseUrl: 'https://api.example.com/api/provider-media',
        signingSecret,
        nowMs
    }));

    assert.equal(url.pathname, `/api/provider-media/${filename}`);
    assert.equal(url.searchParams.get('expires'), String(Math.floor(nowMs / 1000) + 900));
    assert.equal(
        isValidProviderMediaSignature(
            filename,
            url.searchParams.get('expires'),
            url.searchParams.get('signature'),
            { signingSecret, nowMs }
        ),
        true
    );
});

test('rejects tampered and expired provider media URLs', () => {
    const url = new URL(createProviderMediaUrl(filename, {
        baseUrl: 'https://api.example.com/api/provider-media',
        signingSecret,
        nowMs
    }));
    const expires = url.searchParams.get('expires');
    const signature = url.searchParams.get('signature');

    assert.equal(
        isValidProviderMediaSignature(`${filename}.tampered`, expires, signature, { signingSecret, nowMs }),
        false
    );
    assert.equal(
        isValidProviderMediaSignature(
            filename,
            expires,
            `${signature.startsWith('0') ? '1' : '0'}${signature.slice(1)}`,
            { signingSecret, nowMs }
        ),
        false
    );
    assert.equal(
        isValidProviderMediaSignature(filename, expires, signature, {
            signingSecret,
            nowMs: nowMs + (16 * 60 * 1000)
        }),
        false
    );
});

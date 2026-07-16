const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CONTENT_POLICY_ERROR_CODE,
    createKieApiError,
    getKieErrorHttpResponse,
    isKieContentPolicyError
} = require('./kieApiError');

test('maps a Kie.ai HTTP 400 to the content-policy response', () => {
    const error = createKieApiError('SeeDream API error', 400, 'Content was not approved');
    const response = getKieErrorHttpResponse(error, 'Failed to generate image');

    assert.equal(isKieContentPolicyError(error), true);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, CONTENT_POLICY_ERROR_CODE);
    assert.equal(response.body.error, 'Content policy violation');
});

test('maps a Kie.ai body code 400 string to the content-policy response', () => {
    const error = createKieApiError('Task creation failed', '400', { message: 'Request flagged' });
    const response = getKieErrorHttpResponse(error, 'Failed to generate image');

    assert.equal(response.status, 400);
    assert.equal(response.body.code, CONTENT_POLICY_ERROR_CODE);
});

test('keeps non-400 Kie.ai failures as technical errors', () => {
    const error = createKieApiError('SeeDream API error', 503, 'Service unavailable');
    const response = getKieErrorHttpResponse(error, 'Failed to generate image');

    assert.equal(isKieContentPolicyError(error), false);
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'Failed to generate image');
    assert.match(response.body.message, /Service unavailable/);
});

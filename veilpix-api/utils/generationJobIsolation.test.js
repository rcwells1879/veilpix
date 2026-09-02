const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('./database');

function createUsageClient(rows) {
    class Query {
        constructor() {
            this.filters = [];
            this.maximum = null;
        }

        select() { return this; }
        eq(column, value) {
            this.filters.push(row => row[column] === value);
            return this;
        }
        in(column, values) {
            this.filters.push(row => values.includes(row[column]));
            return this;
        }
        order() { return this; }
        limit(value) {
            this.maximum = value;
            return this;
        }
        then(resolve, reject) {
            const matches = rows.filter(row => this.filters.every(filter => filter(row)));
            const data = this.maximum == null ? matches : matches.slice(0, this.maximum);
            return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
    }

    return {
        from(table) {
            assert.equal(table, 'usage_logs');
            return new Query();
        }
    };
}

test('video recovery cannot return another account job with the same generation ID', async () => {
    const generationId = '11111111-1111-4111-8111-111111111111';
    const client = createUsageClient([
        { clerk_user_id: 'user-b', gemini_request_id: generationId, request_type: 'wan3-video', success: true, error_message: 'user-b-result' },
        { clerk_user_id: 'user-a', gemini_request_id: generationId, request_type: 'wan3-video', success: true, error_message: 'user-a-result' }
    ]);

    const { job, error } = await db.getVideoGenerationJob('user-a', generationId, client);
    assert.equal(error, null);
    assert.equal(job.error_message, 'user-a-result');
});

test('image recovery cannot return another account job with the same generation ID', async () => {
    const generationId = '22222222-2222-4222-8222-222222222222';
    const client = createUsageClient([
        { clerk_user_id: 'user-b', gemini_request_id: generationId, request_type: 'text-to-image', success: true, error_message: 'user-b-result' },
        { clerk_user_id: 'user-a', gemini_request_id: generationId, request_type: 'text-to-image', success: true, error_message: 'user-a-result' }
    ]);

    const { job, error } = await db.getImageGenerationJob('user-a', generationId, client);
    assert.equal(error, null);
    assert.equal(job.error_message, 'user-a-result');
});

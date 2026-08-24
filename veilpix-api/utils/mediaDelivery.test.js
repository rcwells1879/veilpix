const test = require('node:test');
const assert = require('node:assert/strict');
const {
    artifactTypeFromResult,
    parseSerializedGenerationResult,
    listPendingDeliveries,
    acknowledgeDelivery,
    acknowledgeDeliveryByGeneration,
    cleanupExpiredDeliveries
} = require('./mediaDelivery');

function createDeliveryClient(rows) {
    const storageRemovals = [];

    class Query {
        constructor(table) {
            this.table = table;
            this.filters = [];
            this.maximum = null;
        }

        select() { return this; }
        eq(column, value) {
            this.filters.push(row => row[column] === value);
            return this;
        }
        gt(column, value) {
            this.filters.push(row => row[column] > value);
            return this;
        }
        order() { return this; }
        limit(value) {
            this.maximum = value;
            return this;
        }
        matchingRows() {
            const matches = rows.filter(row => this.filters.every(filter => filter(row)));
            return this.maximum == null ? matches : matches.slice(0, this.maximum);
        }
        maybeSingle() {
            return Promise.resolve({ data: this.matchingRows()[0] || null, error: null });
        }
        then(resolve, reject) {
            return Promise.resolve({ data: this.matchingRows(), error: null }).then(resolve, reject);
        }
    }

    return {
        storageRemovals,
        from(table) {
            assert.equal(table, 'media_deliveries');
            return new Query(table);
        },
        storage: {
            from() {
                return {
                    remove(paths) {
                        storageRemovals.push(...paths);
                        return Promise.resolve({ error: null });
                    }
                };
            }
        }
    };
}

function createCleanupClient(rows) {
    const storageRemovals = [];
    const deletedDeliveryIds = [];
    const usageUpdates = [];

    class Query {
        constructor(table) {
            this.table = table;
            this.filters = [];
            this.operation = 'select';
            this.payload = null;
            this.maximum = null;
        }

        select() { return this; }
        delete() {
            this.operation = 'delete';
            return this;
        }
        update(payload) {
            this.operation = 'update';
            this.payload = payload;
            return this;
        }
        eq(column, value) {
            this.filters.push(row => row[column] === value);
            return this;
        }
        lt(column, value) {
            this.filters.push(row => row[column] < value);
            return this;
        }
        limit(value) {
            this.maximum = value;
            return this;
        }
        then(resolve, reject) {
            if (this.table === 'media_deliveries' && this.operation === 'select') {
                const matches = rows.filter(row => this.filters.every(filter => filter(row)));
                const data = this.maximum == null ? matches : matches.slice(0, this.maximum);
                return Promise.resolve({ data, error: null }).then(resolve, reject);
            }
            if (this.table === 'media_deliveries' && this.operation === 'delete') {
                deletedDeliveryIds.push(...rows.filter(row => this.filters.every(filter => filter(row))).map(row => row.id));
            }
            if (this.table === 'usage_logs' && this.operation === 'update') {
                usageUpdates.push(this.payload);
            }
            return Promise.resolve({ error: null }).then(resolve, reject);
        }
    }

    return {
        storageRemovals,
        deletedDeliveryIds,
        usageUpdates,
        from(table) { return new Query(table); },
        storage: {
            from() {
                return {
                    remove(paths) {
                        storageRemovals.push(...paths);
                        return Promise.resolve({ error: null });
                    }
                };
            }
        }
    };
}

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

test('delivery listing is isolated to the authenticated account', async () => {
    const expiresAt = '2099-01-01T00:00:00.000Z';
    const client = createDeliveryClient([
        { id: 'delivery-a', clerk_user_id: 'user-a', status: 'pending', expires_at: expiresAt },
        { id: 'delivery-b', clerk_user_id: 'user-b', status: 'pending', expires_at: expiresAt }
    ]);

    const deliveries = await listPendingDeliveries('user-a', client);
    assert.deepEqual(deliveries.map(delivery => delivery.id), ['delivery-a']);
});

test('another account cannot acknowledge or consume a delivery', async () => {
    const expiresAt = '2099-01-01T00:00:00.000Z';
    const client = createDeliveryClient([{
        id: 'delivery-a',
        generation_id: '11111111-1111-4111-8111-111111111111',
        clerk_user_id: 'user-a',
        status: 'pending',
        expires_at: expiresAt,
        storage_bucket: 'media-deliveries',
        storage_path: 'user-a/video.mp4'
    }]);

    const result = await acknowledgeDelivery('user-b', 'delivery-a', client);
    assert.equal(result.alreadyRemoved, true);
    assert.deepEqual(client.storageRemovals, []);
});

test('account acknowledgement retains the object for other browsers until expiry', async () => {
    const expiresAt = '2099-01-01T00:00:00.000Z';
    const generationId = '11111111-1111-4111-8111-111111111111';
    const client = createDeliveryClient([{
        id: 'delivery-a',
        generation_id: generationId,
        clerk_user_id: 'user-a',
        status: 'pending',
        expires_at: expiresAt,
        storage_bucket: 'media-deliveries',
        storage_path: 'user-a/video.mp4'
    }]);

    const result = await acknowledgeDeliveryByGeneration('user-a', generationId, client);
    assert.equal(result.alreadyRemoved, false);
    assert.equal(result.retainedUntil, expiresAt);
    assert.deepEqual(client.storageRemovals, []);
});

test('hard expiry deletes the shared object and delivery record', async () => {
    const client = createCleanupClient([{
        id: 'expired-delivery',
        generation_id: '11111111-1111-4111-8111-111111111111',
        clerk_user_id: 'user-a',
        status: 'pending',
        expires_at: '2000-01-01T00:00:00.000Z',
        storage_bucket: 'media-deliveries',
        storage_path: 'user-a/expired.mp4'
    }, {
        id: 'active-delivery',
        generation_id: '22222222-2222-4222-8222-222222222222',
        clerk_user_id: 'user-a',
        status: 'pending',
        expires_at: '2099-01-01T00:00:00.000Z',
        storage_bucket: 'media-deliveries',
        storage_path: 'user-a/active.mp4'
    }]);

    const removed = await cleanupExpiredDeliveries(client);
    assert.equal(removed, 1);
    assert.deepEqual(client.storageRemovals, ['user-a/expired.mp4']);
    assert.deepEqual(client.deletedDeliveryIds, ['expired-delivery']);
    assert.equal(client.usageUpdates.length, 1);
});

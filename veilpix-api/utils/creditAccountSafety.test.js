const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('./database');

const account = (overrides = {}) => ({
    id: 'account-a', clerk_user_id: 'user-a', email: 'owner@example.com',
    normalized_email: 'owner@example.com', credits_remaining: 40000,
    total_credits_purchased: 200, subscription_status: 'free', ...overrides
});

function userClient(rows, beforeQuery = () => {}) {
    const state = { rows: structuredClone(rows), writes: 0 };
    class Query {
        constructor() { this.filters = []; this.operation = 'read'; }
        select() { return this; }
        eq(column, value) { this.filters.push([column, value]); return this; }
        is(column, value) { return this.eq(column, value); }
        limit(count) { this.maximum = count; return this; }
        upsert(value, options) { this.operation = 'upsert'; this.value = value; this.options = options; return this; }
        update(value) { this.operation = 'update'; this.value = value; return this; }
        single() { this.singular = true; return this; }
        maybeSingle() { this.singular = true; this.optional = true; return this; }
        then(resolve, reject) {
            return Promise.resolve().then(() => {
                const error = beforeQuery(this, state);
                if (error) return { data: null, error };
                let matches = state.rows.filter(row => this.filters.every(([key, value]) => row[key] === value));
                if (this.operation === 'upsert') {
                    state.writes++;
                    const existing = state.rows.find(row => row.clerk_user_id === this.value.clerk_user_id);
                    if (existing && this.options.ignoreDuplicates) matches = [];
                    else if (existing) { Object.assign(existing, this.value); matches = [existing]; }
                    else { const row = { id: 'new-account', ...this.value }; state.rows.push(row); matches = [row]; }
                } else if (this.operation === 'update') {
                    state.writes++;
                    matches.forEach(row => Object.assign(row, this.value));
                }
                if (this.maximum != null) matches = matches.slice(0, this.maximum);
                if (this.singular && matches.length !== 1 && !(this.optional && matches.length === 0)) {
                    return { data: null, error: { message: 'Expected one row' } };
                }
                return { data: structuredClone(this.singular ? matches[0] || null : matches), error: null };
            }).then(resolve, reject);
        }
    }
    return { state, from(table) { assert.equal(table, 'users'); return new Query(); } };
}

test('a Gateway Timeout cannot reset an existing 40000-credit account', async () => {
    const client = userClient([account()], () => ({ message: 'Gateway Timeout' }));
    await assert.rejects(db.createOrGetUser('user-a', 'owner@example.com', { client }), { message: 'Gateway Timeout' });
    assert.equal(client.state.writes, 0);
    assert.equal(client.state.rows[0].credits_remaining, 40000);
    assert.equal(client.state.rows[0].total_credits_purchased, 200);
});

test('failed email lookups cannot create a replacement account', async () => {
    for (const failedColumn of ['normalized_email', 'email']) {
        const client = userClient([], query => query.filters.some(([key]) => key === failedColumn)
            ? { message: 'Gateway Timeout' } : null);
        await assert.rejects(db.createOrGetUser('user-a', 'owner@example.com', { client }), { message: 'Gateway Timeout' });
        assert.equal(client.state.writes, 0);
    }
});

test('concurrent creation preserves the account created by the other request', async () => {
    const client = userClient([], (query, state) => {
        if (query.operation === 'upsert') state.rows.push(account());
    });
    const result = await db.createOrGetUser('user-a', 'owner@example.com', { client });
    assert.equal(result.created, false);
    assert.equal(result.user.credits_remaining, 40000);
    assert.equal(result.user.total_credits_purchased, 200);
});

test('new accounts still receive exactly 30 signup credits', async () => {
    const client = userClient([]);
    const result = await db.createOrGetUser('user-a', 'owner@example.com', { client });
    assert.equal(result.created, true);
    assert.equal(result.user.credits_remaining, 30);
    assert.equal(result.user.total_credits_purchased, 0);
});

test('existing accounts are read without rewriting balances', async () => {
    const client = userClient([account()]);
    const result = await db.createOrGetUser('user-a', 'owner@example.com', { client });
    assert.equal(result.created, false);
    assert.equal(result.user.credits_remaining, 40000);
    assert.equal(client.state.writes, 0);
});

test('email reconciliation cannot overwrite a concurrent operator credit adjustment', async () => {
    const client = userClient([
        account({ credits_remaining: 20 }),
        account({ id: 'old-account', clerk_user_id: 'old-user', credits_remaining: 100 })
    ], (query, state) => {
        if (query.operation === 'update') state.rows[0].credits_remaining = 40000;
    });
    const result = await db.createOrGetUser('user-a', 'owner@example.com', { client });
    assert.equal(result.user.credits_remaining, 40000);
    assert.equal(client.state.rows[0].credits_remaining, 40000);
});

test('fractional refunds use the refund RPC and preserve the idempotency key', async () => {
    const calls = [];
    const client = { async rpc(name, args) { calls.push({ name, args }); return { data: true, error: null }; } };
    for (const credits of [8.43, 12.17]) {
        assert.equal((await db.refundUserCredits('user-a', credits, `video:${credits}`, client)).success, true);
    }
    assert.deepEqual(calls.map(call => [call.name, call.args.p_credits, call.args.p_refund_id]), [
        ['refund_user_credits', 8.43, 'video:8.43'],
        ['refund_user_credits', 12.17, 'video:12.17']
    ]);
});

test('refund failures are reported and invalid amounts never reach the database', async () => {
    let calls = 0;
    const client = { async rpc() { calls++; return { data: null, error: { message: 'Gateway Timeout' } }; } };
    const result = await db.refundUserCredits('user-a', 8.43, 'video:failure', client);
    assert.equal(result.success, false);
    assert.equal(result.error.message, 'Gateway Timeout');
    for (const amount of [0, -1, NaN, Infinity, 0.001]) {
        assert.equal((await db.refundUserCredits('user-a', amount, 'video:invalid', client)).success, false);
    }
    assert.equal(calls, 3);
});

test('an uncertain refund response is retried with the same receipt ID', async () => {
    const calls = [];
    const client = { async rpc(name, args) {
        calls.push(args);
        if (calls.length === 1) throw new Error('Connection closed after commit');
        return { data: true, error: null };
    } };
    assert.equal((await db.refundUserCredits('user-a', 8.43, 'same-reservation', client)).success, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
});

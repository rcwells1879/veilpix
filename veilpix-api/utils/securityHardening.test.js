const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const {
    buildRateLimiterOptions,
    createRateLimiter
} = require('./rateLimiter');
const { handleClerkWebhookEvent } = require('./clerkWebhook');
const { isClerkUserBanned, isClerkUserNotFound } = require('../middleware/auth');

test('rate limiter counts failed responses instead of skipping every request', () => {
    const options = buildRateLimiterOptions(15 * 60 * 1000, 20, 'Too many requests');

    assert.equal(options.skipSuccessfulRequests, true);
    assert.equal(Object.hasOwn(options, 'skip'), false);
});

test('rate limiter preserves successful traffic and blocks repeated failures', async (t) => {
    const app = express();
    app.set('trust proxy', 1);

    app.get('/success', createRateLimiter(60_000, 1, 'Too many successful requests'), (req, res) => {
        res.status(200).json({ ok: true });
    });
    app.get('/failure', createRateLimiter(60_000, 2, 'Too many failed requests'), (req, res) => {
        res.status(401).json({ ok: false });
    });

    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');

    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    assert.equal((await fetch(`${baseUrl}/success`)).status, 200);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await fetch(`${baseUrl}/success`)).status, 200);

    assert.equal((await fetch(`${baseUrl}/failure`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/failure`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/failure`)).status, 429);
});

test('Clerk user deletion events soft-delete the matching application user', async () => {
    const calls = [];
    const result = await handleClerkWebhookEvent({
        type: 'user.deleted',
        data: { id: 'user_deleted' }
    }, {
        async markClerkUserDeleted(clerkUserId) {
            calls.push(clerkUserId);
            return { found: true };
        }
    });

    assert.deepEqual(calls, ['user_deleted']);
    assert.deepEqual(result, {
        handled: true,
        clerkUserId: 'user_deleted',
        userFound: true
    });
});

test('Clerk webhook handler ignores unrelated signed events', async () => {
    const result = await handleClerkWebhookEvent({
        type: 'session.created',
        data: { id: 'sess_123' }
    }, {
        async markClerkUserDeleted() {
            throw new Error('should not be called');
        }
    });

    assert.deepEqual(result, { handled: false });
});

test('deleted Clerk users are recognized even when Clerk returns structured errors', () => {
    assert.equal(isClerkUserNotFound({ status: 404 }), true);
    assert.equal(isClerkUserNotFound({
        errors: [{ code: 'resource_not_found' }]
    }), true);
    assert.equal(isClerkUserNotFound(new Error('Clerk API timeout')), false);
});

test('banned Clerk users are recognized from Clerk state or private moderation metadata', () => {
    assert.equal(isClerkUserBanned({ banned: true }), true);
    assert.equal(isClerkUserBanned({
        banned: false,
        privateMetadata: { moderation: { status: 'banned' } }
    }), true);
    assert.equal(isClerkUserBanned({
        banned: false,
        privateMetadata: { moderation: { status: 'reviewed' } }
    }), false);
});

test('Stripe router no longer exposes the billing meter setup endpoint', () => {
    process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder';
    const stripeRouter = require('../routes/stripe');
    const routePaths = stripeRouter.stack
        .filter(layer => layer.route)
        .map(layer => layer.route.path);

    assert.equal(routePaths.includes('/create-meter'), false);
});

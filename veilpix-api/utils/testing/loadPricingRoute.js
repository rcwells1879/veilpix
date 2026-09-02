const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Exercise real route logic without auth, storage, payments, or provider calls.
module.exports = function loadPricingRoute(name, exposed = [], overrides = {}) {
    const filename = path.resolve(__dirname, '../../routes', `${name}.js`);
    const localRequire = createRequire(filename);
    const noop = (_req, _res, next) => next?.();
    const routes = new Map();
    const router = {
        use() {},
        post(url, ...handlers) { routes.set(`POST ${url}`, handlers); },
        get(url, ...handlers) { routes.set(`GET ${url}`, handlers); }
    };
    const db = {
        async logUsage() { return { success: true }; },
        async getUserCredits() { return { credits: 1000 }; },
        async deductUserCredits() { return { success: true }; },
        ...overrides.db
    };
    const stubs = {
        express: { Router: () => router, json: () => noop },
        multer: () => ({ single: () => noop, fields: () => noop }),
        stripe: () => ({}),
        '../utils/database': { db, supabase: {} },
        '../middleware/auth': { getUser: noop, requireAuth: noop, requireAllowedEmail: noop },
        '../middleware/validation': {},
        '../utils/imageUpload': {
            async uploadTemporaryImage() { return { success: true, url: 'https://example.test/input.png', filename: 'input.png' }; },
            async deleteTemporaryImage() {},
            ...overrides.upload
        }
    };
    const module = { exports: {} };
    const context = {
        module, exports: module.exports,
        require: (id) => Object.hasOwn(stubs, id) ? stubs[id] : localRequire(id),
        process: { env: { SEEDREAM_API_KEY: 'test-only-key' } },
        console: { log() {}, warn() {}, error() {} },
        Buffer, setTimeout,
        fetch: overrides.fetch || (async () => { throw new Error('Unexpected network request'); })
    };
    vm.runInNewContext(`${fs.readFileSync(filename, 'utf8')}\nmodule.exports.testPricing = { ${exposed.join(', ')} };`, context, { filename });
    return { ...module.exports.testPricing, routes, db };
};

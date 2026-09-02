const rateLimit = require('express-rate-limit');

function buildRateLimiterOptions(windowMs, max, message) {
    return {
        windowMs,
        max,
        message: {
            error: message,
            retryAfter: Math.ceil(windowMs / 60000) + ' minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        // Count failed requests, then remove successful responses from the quota.
        // `skip` runs before the handler, when every response still has a 200 status.
        skipSuccessfulRequests: true
    };
}

function createRateLimiter(windowMs, max, message) {
    return rateLimit(buildRateLimiterOptions(windowMs, max, message));
}

module.exports = {
    buildRateLimiterOptions,
    createRateLimiter
};

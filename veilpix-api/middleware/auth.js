const { clerkClient } = require('@clerk/express');
const { db } = require('../utils/database');

// Middleware to extract user from Clerk session (optional authentication)
async function getUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No auth header, continue as anonymous user
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        
        try {
            // Verify the session token with Clerk
            const sessionToken = await clerkClient.verifySession(token);
            
            if (sessionToken && sessionToken.userId) {
                // Get or create user in our database
                const { user } = await db.createOrGetUser(
                    sessionToken.userId,
                    sessionToken.user?.emailAddresses?.[0]?.emailAddress
                );
                
                req.user = {
                    id: user.id,
                    userId: sessionToken.userId,
                    email: user.email,
                    stripeCustomerId: user.stripe_customer_id,
                    subscriptionStatus: user.subscription_status
                };
            } else {
                req.user = null;
            }
        } catch (clerkError) {
            console.error('Clerk verification error:', clerkError);
            req.user = null;
        }

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        req.user = null;
        next();
    }
}

// Middleware to require authentication
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please sign in to access this feature'
        });
    }
    next();
}

// Middleware to check if user has valid subscription/payment method
async function requirePaymentMethod(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please sign in to access this feature'
        });
    }

    // Check if user has a Stripe customer ID (indicating they've set up payments)
    if (!req.user.stripeCustomerId) {
        return res.status(402).json({
            error: 'Payment method required',
            message: 'Please add a payment method to continue using the service',
            requiresPaymentSetup: true
        });
    }

    next();
}

module.exports = {
    getUser,
    requireAuth,
    requirePaymentMethod
};
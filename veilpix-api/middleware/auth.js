const { getAuth, clerkClient } = require('@clerk/express');
const { db } = require('../utils/database');

// Middleware to extract user from Clerk session (optional authentication)
async function getUser(req, res, next) {
    try {
        // Get authentication info from Clerk middleware
        const auth = getAuth(req);
        
        if (!auth || !auth.userId) {
            // No authenticated user, continue as anonymous user
            req.user = null;
            return next();
        }

        try {
            // Get user details from Clerk to get email
            let userEmail = null;
            try {
                const clerkUser = await clerkClient.users.getUser(auth.userId);
                userEmail = clerkUser.emailAddresses?.[0]?.emailAddress || null;
            } catch (clerkError) {
                console.log('Could not fetch user email from Clerk:', clerkError.message);
            }
            
            // Get or create user in our database
            const { user } = await db.createOrGetUser(
                auth.userId,
                userEmail
            );
            
            req.user = {
                id: user.id,
                userId: auth.userId,
                email: user.email,
                stripeCustomerId: user.stripe_customer_id,
                subscriptionStatus: user.subscription_status
            };
        } catch (dbError) {
            console.error('Database error in getUser:', dbError);
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
    try {
        // Get authentication info from Clerk middleware
        const auth = getAuth(req);
        
        if (!auth || !auth.userId) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please sign in to access this feature'
            });
        }
        
        // If we have auth but no req.user, that means getUser wasn't called first
        if (!req.user) {
            return res.status(500).json({
                error: 'Internal error',
                message: 'Authentication middleware not properly configured'
            });
        }
        
        next();
    } catch (error) {
        console.error('RequireAuth error:', error);
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please sign in to access this feature'
        });
    }
}

// Middleware to check if user has valid subscription/payment method
async function requirePaymentMethod(req, res, next) {
    try {
        // Get authentication info from Clerk middleware
        const auth = getAuth(req);
        
        if (!auth || !auth.userId) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please sign in to access this feature'
            });
        }

        // If we have auth but no req.user, that means getUser wasn't called first
        if (!req.user) {
            return res.status(500).json({
                error: 'Internal error',
                message: 'Authentication middleware not properly configured'
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
    } catch (error) {
        console.error('RequirePaymentMethod error:', error);
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please sign in to access this feature'
        });
    }
}

module.exports = {
    getUser,
    requireAuth,
    requirePaymentMethod
};
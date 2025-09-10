const { getAuth, clerkClient } = require('@clerk/express');
const { db } = require('../utils/database');

// Middleware to extract user from Clerk session (optional authentication)
async function getUser(req, res, next) {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`🔍 AUTH[${requestId}]: getUser called for ${req.method} ${req.path}`);
    
    try {
        // Get authentication info from Clerk middleware with timeout
        console.log(`🔍 AUTH[${requestId}]: Calling getAuth(req)`);
        const auth = getAuth(req);
        console.log(`🔍 AUTH[${requestId}]: getAuth result:`, !!auth, auth?.userId ? 'has userId' : 'no userId');
        
        if (!auth || !auth.userId) {
            // No authenticated user, continue as anonymous user
            console.log(`🔍 AUTH[${requestId}]: No auth/userId, setting req.user = null`);
            req.user = null;
            console.log(`🔍 AUTH[${requestId}]: Calling next() for anonymous user`);
            return next();
        }

        // Handle authenticated user with retry logic
        const maxRetries = 2;
        let attempt = 0;
        
        while (attempt <= maxRetries) {
            try {
                console.log(`🔍 AUTH[${requestId}]: Processing authenticated user (attempt ${attempt + 1})`);
                
                // Get user details from Clerk to get email with timeout
                let userEmail = null;
                try {
                    console.log(`🔍 AUTH[${requestId}]: Fetching user email from Clerk...`);
                    
                    // Add timeout to Clerk API call
                    const clerkPromise = clerkClient.users.getUser(auth.userId);
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Clerk API timeout')), 5000)
                    );
                    
                    const clerkUser = await Promise.race([clerkPromise, timeoutPromise]);
                    userEmail = clerkUser.emailAddresses?.[0]?.emailAddress || null;
                    console.log(`✅ AUTH[${requestId}]: Successfully fetched user email`);
                } catch (clerkError) {
                    console.warn(`⚠️ AUTH[${requestId}]: Could not fetch user email from Clerk:`, clerkError.message);
                    // Continue without email - not critical
                }
                
                // Get or create user in our database
                console.log(`🔍 AUTH[${requestId}]: About to call createOrGetUser with userId:`, auth.userId);
                const { user } = await db.createOrGetUser(auth.userId, userEmail);
                console.log(`✅ AUTH[${requestId}]: createOrGetUser completed successfully`);
                
                req.user = {
                    id: user.id,
                    userId: auth.userId,
                    email: user.email,
                    stripeCustomerId: user.stripe_customer_id,
                    subscriptionStatus: user.subscription_status
                };
                
                console.log(`✅ AUTH[${requestId}]: User authenticated successfully`);
                return next();
                
            } catch (dbError) {
                console.error(`🚨 AUTH[${requestId}]: Database error (attempt ${attempt + 1}):`, dbError);
                
                // Check if this is a retryable error
                if (attempt < maxRetries && this._isRetryableDbError(dbError)) {
                    attempt++;
                    const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
                    console.log(`🔄 AUTH[${requestId}]: Retrying database operation in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                // If we can't get user from database, continue as anonymous but log the issue
                console.error(`🚨 AUTH[${requestId}]: Failed to get user from database after ${attempt + 1} attempts, continuing as anonymous`);
                req.user = null;
                return next();
            }
        }

    } catch (error) {
        console.error(`🚨 AUTH[${requestId}]: Unexpected auth middleware error:`, error);
        console.error(`🚨 AUTH[${requestId}]: Stack trace:`, error.stack);
        req.user = null;
        next();
    }
}

// Helper function to determine if database error is retryable
function _isRetryableDbError(error) {
    const retryableMessages = [
        'connection',
        'timeout', 
        'network',
        'temporary',
        'pool',
        'ECONNRESET',
        'ETIMEDOUT'
    ];
    
    return retryableMessages.some(msg => 
        error.message?.toLowerCase().includes(msg.toLowerCase())
    );
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
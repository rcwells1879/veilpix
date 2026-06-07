const express = require('express');
const { getUser, requireAuth } = require('../middleware/auth');
const { db, supabase } = require('../utils/database');
const { normalizeEmail } = require('../utils/emailNormalizer');

const router = express.Router();

// Get current user info
router.get('/me', getUser, async (req, res) => {
    try {
        if (!req.user) {
            return res.json({
                authenticated: false,
                user: null
            });
        }

        // Get current month usage
        const usageCount = await db.getUserUsageCount(req.user.userId);
        
        res.json({
            authenticated: true,
            user: {
                id: req.user.id,
                userId: req.user.userId,
                email: req.user.email,
                subscriptionStatus: req.user.subscriptionStatus,
                hasPaymentMethod: !!req.user.stripeCustomerId,
                currentMonthUsage: usageCount
            }
        });
    } catch (error) {
        console.error('Error getting user info:', error);
        res.status(500).json({
            error: 'Failed to get user information'
        });
    }
});

// Temporary owner-only diagnostic for credit/user reconciliation.
router.get('/debug/users-by-email', getUser, requireAuth, async (req, res) => {
    try {
        const email = req.user?.email || '';
        const normalizedEmail = normalizeEmail(email);

        if (normalizedEmail !== 'rycwells@gmail.com') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'This diagnostic is restricted to the owner account.'
            });
        }

        const client = supabase();
        const candidates = new Map();

        for (const [column, value] of [
            ['email', email],
            ['normalized_email', normalizedEmail]
        ]) {
            if (!value) continue;
            const { data, error } = await client
                .from('users')
                .select('id, clerk_user_id, email, normalized_email, credits_remaining, total_credits_purchased, stripe_customer_id, subscription_status, created_at, updated_at')
                .eq(column, value)
                .limit(25);

            if (error) {
                return res.status(500).json({
                    error: 'Failed to query users',
                    column,
                    message: error.message
                });
            }

            for (const row of data || []) {
                candidates.set(row.id, {
                    ...row,
                    has_stripe_customer_id: Boolean(row.stripe_customer_id),
                    stripe_customer_id: row.stripe_customer_id ? `${row.stripe_customer_id.slice(0, 8)}...` : null
                });
            }
        }

        res.json({
            authenticatedUser: {
                databaseUserId: req.user.id,
                clerkUserId: req.user.userId,
                email,
                normalizedEmail
            },
            matchingUserRows: [...candidates.values()].sort((a, b) =>
                Number(b.credits_remaining || 0) - Number(a.credits_remaining || 0)
            )
        });
    } catch (error) {
        console.error('Error querying debug users by email:', error);
        res.status(500).json({
            error: 'Failed to query debug users by email',
            message: error.message
        });
    }
});

// Sync user data with Clerk
router.post('/sync', getUser, requireAuth, async (req, res) => {
    try {
        const { email } = req.body;
        
        // Update user email if provided
        if (email && email !== req.user.email) {
            await supabase
                .from('users')
                .update({ email })
                .eq('clerk_user_id', req.user.userId);
        }

        res.json({
            success: true,
            message: 'User data synchronized'
        });
    } catch (error) {
        console.error('Error syncing user data:', error);
        res.status(500).json({
            error: 'Failed to sync user data'
        });
    }
});

module.exports = router;

const express = require('express');
const { getUser, requireAuth } = require('../middleware/auth');
const { db, supabase } = require('../utils/database');

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

// Sync user data with Clerk
router.post('/sync', getUser, requireAuth, async (req, res) => {
    try {
        const { email } = req.body;
        
        // Update user email if provided
        if (email && email !== req.user.email) {
            await supabase()
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
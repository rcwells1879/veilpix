const express = require('express');
const { getUser, requireAuth } = require('../middleware/auth');
const { db, supabase } = require('../utils/database');

const router = express.Router();

// Get usage statistics for authenticated user
router.get('/stats', getUser, requireAuth, async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        
        let periodStart;
        const now = new Date();
        
        switch (period) {
            case 'today':
                periodStart = new Date(now.setHours(0, 0, 0, 0));
                break;
            case 'week':
                periodStart = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
            default:
                periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
        }

        // Get credits and usage count for authenticated user
        const usageCount = await db.getUserUsageCount(req.user.userId, periodStart.toISOString());
        const { credits, totalPurchased } = await db.getUserCredits(req.user.userId);

        // Return frontend-compatible format with credits
        res.json({
            totalUsage: usageCount,
            creditsRemaining: credits,
            totalCreditsPurchased: totalPurchased,
            isAuthenticated: true
        });

    } catch (error) {
        console.error('Error getting usage stats:', error);
        res.status(500).json({
            error: 'Failed to get usage statistics'
        });
    }
});

// Get user credit information (replaces anonymous endpoints)
router.get('/credits', getUser, requireAuth, async (req, res) => {
    try {
        const { credits, totalPurchased, error } = await db.getUserCredits(req.user.userId);
        
        if (error) {
            return res.status(500).json({
                error: 'Failed to get credits information'
            });
        }

        res.json({
            creditsRemaining: credits,
            totalCreditsPurchased: totalPurchased,
            isAuthenticated: true
        });
    } catch (error) {
        console.error('Error getting credits:', error);
        res.status(500).json({
            error: 'Failed to get credits information'
        });
    }
});

// Health check endpoint for usage system
router.get('/health', async (req, res) => {
    try {
        // Test database connection by checking users table
        const supabase = require('../utils/database').supabase;
        const { error } = await supabase.from('users').select('id').limit(1);
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: error ? 'error' : 'connected',
            endpoints: {
                stats: '/api/usage/stats (authenticated)',
                credits: '/api/usage/credits (authenticated)'
            }
        });
    } catch (error) {
        console.error('Usage health check failed:', error);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

module.exports = router;
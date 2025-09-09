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

        // Get total usage count for authenticated user
        const usageCount = await db.getUserUsageCount(req.user.userId, periodStart.toISOString());

        // Return frontend-compatible format
        res.json({
            totalUsage: usageCount,
            remainingFreeUsage: undefined, // Authenticated users don't have limits
            isAuthenticated: true
        });

    } catch (error) {
        console.error('Error getting usage stats:', error);
        res.status(500).json({
            error: 'Failed to get usage statistics'
        });
    }
});

// Get anonymous usage count (without session ID - for general anonymous usage info)
router.get('/anonymous', async (req, res) => {
    try {
        // Get session ID from header or return default values
        const sessionId = req.headers['x-session-id'];
        
        if (!sessionId) {
            // Return default values if no session ID provided
            return res.json({
                totalUsage: 0,
                remainingFreeUsage: 20,
                isAuthenticated: false
            });
        }

        // Get actual usage for this session
        const { data: usage } = await db.getAnonymousUsage(sessionId, req.ip);
        const currentCount = usage?.request_count || 0;
        
        res.json({
            totalUsage: currentCount,
            remainingFreeUsage: Math.max(0, 20 - currentCount),
            isAuthenticated: false
        });
    } catch (error) {
        console.error('Error getting anonymous usage:', error);
        res.status(500).json({
            error: 'Failed to get usage information'
        });
    }
});

// Get anonymous usage count with session ID
router.get('/anonymous/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const ipAddress = req.ip;

        const { data: usage } = await db.getAnonymousUsage(sessionId, ipAddress);
        const currentCount = usage?.request_count || 0;

        res.json({
            totalUsage: currentCount,
            remainingFreeUsage: Math.max(0, 20 - currentCount),
            isAuthenticated: false
        });

    } catch (error) {
        console.error('Error getting anonymous usage:', error);
        res.status(500).json({
            error: 'Failed to get usage information'
        });
    }
});

// Health check endpoint for usage system
router.get('/health', async (req, res) => {
    try {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            endpoints: {
                stats: '/api/usage/stats (authenticated)',
                anonymous: '/api/usage/anonymous (public)'
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
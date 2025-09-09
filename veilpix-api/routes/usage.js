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

        // Get detailed usage logs
        const { data: usageLogs, error } = await supabase()
            .from('usage_logs')
            .select('*')
            .eq('clerk_user_id', req.user.userId)
            .gte('created_at', periodStart.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Calculate statistics
        const stats = {
            totalRequests: usageLogs.length,
            successfulRequests: usageLogs.filter(log => log.success).length,
            failedRequests: usageLogs.filter(log => !log.success).length,
            totalCostUsd: usageLogs.reduce((sum, log) => sum + parseFloat(log.charged_amount_usd || 0), 0),
            avgProcessingTime: usageLogs.length > 0 
                ? usageLogs.reduce((sum, log) => sum + (log.processing_time_ms || 0), 0) / usageLogs.length 
                : 0,
            requestsByType: {
                retouch: usageLogs.filter(log => log.request_type === 'retouch').length,
                filter: usageLogs.filter(log => log.request_type === 'filter').length,
                adjust: usageLogs.filter(log => log.request_type === 'adjust').length
            },
            recentRequests: usageLogs.slice(0, 10) // Last 10 requests
        };

        res.json({
            success: true,
            period,
            periodStart: periodStart.toISOString(),
            stats
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
        res.json({
            success: true,
            usage: {
                used: 0,
                remaining: 20,
                limit: 20
            },
            message: 'Anonymous usage tracking - provide session ID for accurate counts'
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
            success: true,
            sessionId,
            usage: {
                used: currentCount,
                remaining: Math.max(0, 20 - currentCount),
                limit: 20
            }
        });

    } catch (error) {
        console.error('Error getting anonymous usage:', error);
        res.status(500).json({
            error: 'Failed to get usage information'
        });
    }
});

module.exports = router;
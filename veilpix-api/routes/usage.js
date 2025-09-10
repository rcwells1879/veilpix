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

// Validate session and get detailed usage info
router.post('/validate-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const ipAddress = req.ip;

        if (!sessionId) {
            return res.status(400).json({
                error: 'Session ID required',
                message: 'Please provide a valid session ID'
            });
        }

        console.log('🔍 SESSION VALIDATION: Validating session:', sessionId);

        // Get current usage for the session
        const { data: usage, error } = await db.getAnonymousUsage(sessionId, ipAddress);
        
        if (error) {
            console.error('🚨 SESSION VALIDATION: Error getting usage:', error);
            return res.status(500).json({
                error: 'Failed to validate session',
                message: 'Please try again in a moment'
            });
        }

        const currentCount = usage?.request_count || 0;
        const isValid = currentCount < 20;
        
        console.log('✅ SESSION VALIDATION: Session validated', {
            sessionId,
            currentCount,
            isValid,
            remaining: Math.max(0, 20 - currentCount)
        });

        res.json({
            sessionId,
            isValid,
            usage: {
                current: currentCount,
                limit: 20,
                remaining: Math.max(0, 20 - currentCount)
            },
            lastActivity: usage?.updated_at || usage?.created_at,
            ipAddress: usage?.ip_address
        });

    } catch (error) {
        console.error('🚨 SESSION VALIDATION: Unexpected error:', error);
        res.status(500).json({
            error: 'Session validation failed',
            message: 'Please try again in a moment'
        });
    }
});

// Cleanup expired anonymous sessions (admin endpoint)
router.delete('/cleanup-sessions', async (req, res) => {
    try {
        const { olderThanDays = 7 } = req.query;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

        console.log('🔍 CLEANUP: Starting session cleanup for sessions older than:', cutoffDate.toISOString());

        const supabase = require('../utils/database').supabase();
        
        const { data: deletedSessions, error } = await supabase
            .from('anonymous_usage')
            .delete()
            .lt('updated_at', cutoffDate.toISOString())
            .select();

        if (error) {
            throw error;
        }

        const deletedCount = deletedSessions?.length || 0;
        console.log(`✅ CLEANUP: Successfully deleted ${deletedCount} expired sessions`);

        res.json({
            success: true,
            deletedCount,
            cutoffDate: cutoffDate.toISOString(),
            message: `Successfully cleaned up ${deletedCount} expired anonymous sessions`
        });

    } catch (error) {
        console.error('🚨 CLEANUP: Error during session cleanup:', error);
        res.status(500).json({
            error: 'Session cleanup failed',
            message: error.message
        });
    }
});

// Health check endpoint for usage system
router.get('/health', async (req, res) => {
    try {
        // Test database connection
        const testResult = await db.getAnonymousUsage('health-check-session', req.ip);
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: testResult.error ? 'error' : 'connected',
            endpoints: {
                stats: '/api/usage/stats (authenticated)',
                anonymous: '/api/usage/anonymous (public)',
                validateSession: '/api/usage/validate-session (POST)',
                cleanup: '/api/usage/cleanup-sessions (DELETE, admin)'
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
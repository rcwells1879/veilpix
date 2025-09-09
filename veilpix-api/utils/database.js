const { createClient } = require('@supabase/supabase-js');

// Create Supabase client lazily to avoid module loading issues
let supabase = null;

function getSupabaseClient() {
    if (!supabase) {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
        }
        
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );
    }
    return supabase;
}

// Test database connection on startup
async function testConnection() {
    try {
        console.log('🔍 Testing Supabase connection...');
        console.log('  - SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
        console.log('  - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
        
        const supabaseClient = getSupabaseClient();
        const { data, error } = await supabaseClient
            .from('users')
            .select('id')
            .limit(1);
            
        if (error) {
            console.error('❌ Supabase connection failed:', error.message);
            return false;
        }
        
        console.log('✅ Supabase connection successful');
        return true;
    } catch (error) {
        console.error('❌ Supabase connection error:', error.message);
        return false;
    }
}

// Test connection on module load
testConnection();

// Database utility functions
const db = {
    // User management
    async createOrGetUser(clerkUserId, email) {
        try {
            const supabase = getSupabaseClient();
            
            // First try to get existing user
            const { data: existingUser, error: fetchError } = await supabase
                .from('users')
                .select('*')
                .eq('clerk_user_id', clerkUserId)
                .single();

            if (existingUser && !fetchError) {
                return { user: existingUser, created: false };
            }

            // Create new user if doesn't exist
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    clerk_user_id: clerkUserId,
                    email: email,
                    subscription_status: 'free'
                })
                .select()
                .single();

            if (createError) {
                throw createError;
            }

            return { user: newUser, created: true };
        } catch (error) {
            console.error('Error creating/getting user:', error);
            throw error;
        }
    },

    // Usage tracking
    async logUsage({
        userId,
        clerkUserId,
        sessionId,
        requestType,
        costUsd = 0.04,
        chargedAmountUsd = 0.07,
        geminiRequestId,
        imageSize = 'medium',
        processingTimeMs,
        success = false,
        errorMessage = null
    }) {
        try {
            const supabase = getSupabaseClient();
            
            const { data, error } = await supabase
                .from('usage_logs')
                .insert({
                    user_id: userId,
                    clerk_user_id: clerkUserId,
                    session_id: sessionId,
                    request_type: requestType,
                    cost_usd: costUsd,
                    charged_amount_usd: chargedAmountUsd,
                    gemini_request_id: geminiRequestId,
                    image_size: imageSize,
                    processing_time_ms: processingTimeMs,
                    success,
                    error_message: errorMessage
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error logging usage:', error);
            throw error;
        }
    },

    // Get user usage count for current month
    async getUserUsageCount(clerkUserId, periodStart = null) {
        try {
            const supabase = getSupabaseClient();
            const startDate = periodStart || new Date(new Date().setDate(1)).toISOString(); // Start of current month
            
            const { data, error } = await supabase
                .from('usage_logs')
                .select('id')
                .eq('clerk_user_id', clerkUserId)
                .eq('success', true)
                .gte('created_at', startDate);

            if (error) {
                throw error;
            }

            return data.length;
        } catch (error) {
            console.error('Error getting usage count:', error);
            throw error;
        }
    },

    // Anonymous user usage tracking
    async getAnonymousUsage(sessionId, ipAddress) {
        try {
            const supabase = getSupabaseClient();
            
            const { data, error } = await supabase
                .from('anonymous_usage')
                .select('*')
                .eq('session_id', sessionId)
                .single();

            return { data, error };
        } catch (error) {
            console.error('Error getting anonymous usage:', error);
            return { data: null, error };
        }
    },

    async updateAnonymousUsage(sessionId, ipAddress) {
        try {
            const supabase = getSupabaseClient();
            const { data: existing } = await this.getAnonymousUsage(sessionId, ipAddress);
            
            if (existing) {
                // Update existing record
                const { data, error } = await supabase
                    .from('anonymous_usage')
                    .update({
                        request_count: existing.request_count + 1,
                        last_request_at: new Date().toISOString()
                    })
                    .eq('session_id', sessionId)
                    .select()
                    .single();

                return { data, error };
            } else {
                // Create new record
                const { data, error } = await supabase
                    .from('anonymous_usage')
                    .insert({
                        session_id: sessionId,
                        ip_address: ipAddress,
                        request_count: 1
                    })
                    .select()
                    .single();

                return { data, error };
            }
        } catch (error) {
            console.error('Error updating anonymous usage:', error);
            return { data: null, error };
        }
    },

    // Billing functions
    async createBillingRecord({
        userId,
        stripeInvoiceId,
        billingPeriodStart,
        billingPeriodEnd,
        totalRequests,
        totalAmountUsd,
        stripeChargeId,
        status = 'pending'
    }) {
        try {
            const supabase = getSupabaseClient();
            
            const { data, error } = await supabase
                .from('billing_records')
                .insert({
                    user_id: userId,
                    stripe_invoice_id: stripeInvoiceId,
                    billing_period_start: billingPeriodStart,
                    billing_period_end: billingPeriodEnd,
                    total_requests: totalRequests,
                    total_amount_usd: totalAmountUsd,
                    stripe_charge_id: stripeChargeId,
                    status
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error creating billing record:', error);
            throw error;
        }
    },

    // Update user's Stripe customer ID
    async updateUserStripeCustomerId(clerkUserId, stripeCustomerId) {
        try {
            const supabase = getSupabaseClient();
            
            const { data, error } = await supabase
                .from('users')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('clerk_user_id', clerkUserId)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error updating Stripe customer ID:', error);
            throw error;
        }
    }
};

module.exports = { supabase: getSupabaseClient, db };
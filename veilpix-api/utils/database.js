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

// Connection test available for manual testing
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

// Database utility functions
const db = {
    // User management
    async createOrGetUser(clerkUserId, email) {
        try {
            console.log('🔍 DB: createOrGetUser called with:', { clerkUserId, email });
            const supabase = getSupabaseClient();
            console.log('🔍 DB: Got supabase client');
            
            // First try to get existing user
            console.log('🔍 DB: About to query users table...');
            const { data: existingUser, error: fetchError } = await supabase
                .from('users')
                .select('*')
                .eq('clerk_user_id', clerkUserId)
                .single();
            
            console.log('🔍 DB: Query completed. Data:', !!existingUser, 'Error:', fetchError?.message);

            if (existingUser && !fetchError) {
                console.log('🔍 DB: Found existing user, returning');
                return { user: existingUser, created: false };
            }

            // Create new user if doesn't exist
            console.log('🔍 DB: Creating new user...');
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    clerk_user_id: clerkUserId,
                    email: email,
                    subscription_status: 'free'
                })
                .select()
                .single();
            
            console.log('🔍 DB: Insert completed. Data:', !!newUser, 'Error:', createError?.message);

            if (createError) {
                throw createError;
            }

            console.log('🔍 DB: Created new user, returning');
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
        const maxRetries = 3;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                console.log(`🔍 DB: getAnonymousUsage attempt ${attempt + 1}/${maxRetries} for session:`, sessionId);
                const supabase = getSupabaseClient();
                
                const { data, error } = await supabase
                    .from('anonymous_usage')
                    .select('*')
                    .eq('session_id', sessionId)
                    .single();

                if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" which is expected
                    console.error(`🚨 DB: Error getting anonymous usage (attempt ${attempt + 1}):`, error);
                    
                    // Check if this is a retryable error
                    if (this._isRetryableError(error) && attempt < maxRetries - 1) {
                        attempt++;
                        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
                        console.log(`🔄 DB: Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }

                return { data, error };
            } catch (exception) {
                console.error(`🚨 DB: Exception getting anonymous usage (attempt ${attempt + 1}):`, exception);
                
                if (attempt < maxRetries - 1) {
                    attempt++;
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                    console.log(`🔄 DB: Retrying after exception in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                return { data: null, error: exception };
            }
        }
        
        return { data: null, error: new Error('Max retries exceeded') };
    },

    // Helper function to determine if an error is retryable
    _isRetryableError(error) {
        // Retry on connection issues, timeouts, and temporary server errors
        const retryableCodes = [
            'ECONNRESET',
            'ECONNREFUSED', 
            'ETIMEDOUT',
            'ENOTFOUND',
            'EAI_AGAIN'
        ];
        
        const retryableMessages = [
            'connection',
            'timeout',
            'network',
            'temporary'
        ];
        
        return retryableCodes.includes(error.code) || 
               retryableMessages.some(msg => error.message?.toLowerCase().includes(msg));
    },

    async updateAnonymousUsage(sessionId, ipAddress) {
        try {
            console.log('🔍 DB: updateAnonymousUsage called with:', { sessionId, ipAddress });
            const supabase = getSupabaseClient();
            
            // Fix: Use db.getAnonymousUsage instead of this.getAnonymousUsage
            const { data: existing, error: fetchError } = await db.getAnonymousUsage(sessionId, ipAddress);
            console.log('🔍 DB: Existing usage data:', existing, 'Error:', fetchError?.message);
            
            if (existing && !fetchError) {
                // Update existing record
                console.log('🔍 DB: Updating existing record, current count:', existing.request_count);
                const { data, error } = await supabase
                    .from('anonymous_usage')
                    .update({
                        request_count: existing.request_count + 1,
                        updated_at: new Date().toISOString()
                    })
                    .eq('session_id', sessionId)
                    .select()
                    .single();

                if (error) {
                    console.error('🚨 DB: Error updating existing record:', error);
                    return { data: null, error };
                }
                
                console.log('✅ DB: Successfully updated usage count to:', data.request_count);
                return { data, error: null };
            } else {
                // Create new record
                console.log('🔍 DB: Creating new usage record for session:', sessionId);
                const { data, error } = await supabase
                    .from('anonymous_usage')
                    .insert({
                        session_id: sessionId,
                        ip_address: ipAddress,
                        request_count: 1
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('🚨 DB: Error creating new record:', error);
                    return { data: null, error };
                }
                
                console.log('✅ DB: Successfully created new usage record with count:', data.request_count);
                return { data, error: null };
            }
        } catch (error) {
            console.error('🚨 DB: Exception in updateAnonymousUsage:', error);
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

module.exports = { supabase: getSupabaseClient, db, testConnection };
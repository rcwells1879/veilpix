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

            // Create new user if doesn't exist (with 30 initial credits)
            console.log('🔍 DB: Creating new user with 30 initial credits...');
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    clerk_user_id: clerkUserId,
                    email: email,
                    subscription_status: 'free',
                    credits_remaining: 30,
                    total_credits_purchased: 0
                })
                .select()
                .single();
            
            console.log('🔍 DB: Insert completed. Data:', !!newUser, 'Error:', createError?.message);

            if (createError) {
                throw createError;
            }

            console.log('🔍 DB: Created new user with 30 credits, returning');
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

    // Credit management functions
    async getUserCredits(clerkUserId) {
        try {
            console.log('🔍 DB: getUserCredits called for:', clerkUserId);
            const supabase = getSupabaseClient();
            
            const { data: user, error } = await supabase
                .from('users')
                .select('credits_remaining, total_credits_purchased')
                .eq('clerk_user_id', clerkUserId)
                .single();

            if (error) {
                console.error('🚨 DB: Error getting user credits:', error);
                return { credits: 0, totalPurchased: 0, error };
            }

            return {
                credits: user?.credits_remaining || 0,
                totalPurchased: user?.total_credits_purchased || 0,
                error: null
            };
        } catch (error) {
            console.error('🚨 DB: Exception getting user credits:', error);
            return { credits: 0, totalPurchased: 0, error };
        }
    },

    async deductUserCredit(clerkUserId) {
        try {
            console.log('🔍 DB: deductUserCredit called for:', clerkUserId);
            const supabase = getSupabaseClient();
            
            // Use the database function for atomic credit deduction
            const { data, error } = await supabase
                .rpc('deduct_user_credit', { p_clerk_user_id: clerkUserId });

            if (error) {
                console.error('🚨 DB: Error deducting user credit:', error);
                return { success: false, error };
            }

            const success = data === true;
            console.log(success ? '✅ DB: Successfully deducted 1 credit' : '❌ DB: No credits available to deduct');
            return { success, error: null };
        } catch (error) {
            console.error('🚨 DB: Exception deducting user credit:', error);
            return { success: false, error };
        }
    },

    async addUserCredits(clerkUserId, credits) {
        try {
            console.log('🔍 DB: addUserCredits called with:', { clerkUserId, credits });
            const supabase = getSupabaseClient();
            
            // Use the database function for atomic credit addition
            const { data, error } = await supabase
                .rpc('add_user_credits', { 
                    p_clerk_user_id: clerkUserId, 
                    p_credits: credits 
                });

            if (error) {
                console.error('🚨 DB: Error adding user credits:', error);
                return { success: false, error };
            }

            const success = data === true;
            console.log(success ? `✅ DB: Successfully added ${credits} credits` : '❌ DB: Failed to add credits');
            return { success, error: null };
        } catch (error) {
            console.error('🚨 DB: Exception adding user credits:', error);
            return { success: false, error };
        }
    },

    async logCreditPurchase({
        userId,
        clerkUserId,
        stripePaymentIntentId,
        stripeCheckoutSessionId,
        creditsPurchased,
        amountUsd,
        packageType,
        status = 'pending'
    }) {
        try {
            console.log('🔍 DB: logCreditPurchase called with:', {
                clerkUserId,
                creditsPurchased,
                amountUsd,
                packageType
            });
            const supabase = getSupabaseClient();
            
            const { data, error } = await supabase
                .from('credit_purchases')
                .insert({
                    user_id: userId,
                    clerk_user_id: clerkUserId,
                    stripe_payment_intent_id: stripePaymentIntentId,
                    stripe_checkout_session_id: stripeCheckoutSessionId,
                    credits_purchased: creditsPurchased,
                    amount_usd: amountUsd,
                    package_type: packageType,
                    status
                })
                .select()
                .single();

            if (error) {
                console.error('🚨 DB: Error logging credit purchase:', error);
                throw error;
            }

            console.log('✅ DB: Successfully logged credit purchase');
            return data;
        } catch (error) {
            console.error('🚨 DB: Exception logging credit purchase:', error);
            throw error;
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

module.exports = { supabase: getSupabaseClient, getSupabaseClient, db, testConnection };
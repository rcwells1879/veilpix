const { createClient } = require('@supabase/supabase-js');
const { normalizeEmail } = require('./emailNormalizer');

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

function numericValue(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function pickBestCreditUser(users, currentUserId = null) {
    return (users || [])
        .filter(user => user && user.id !== currentUserId)
        .sort((a, b) => {
            const creditDelta = numericValue(b.credits_remaining) - numericValue(a.credits_remaining);
            if (creditDelta !== 0) return creditDelta;
            return numericValue(b.total_credits_purchased) - numericValue(a.total_credits_purchased);
        })[0] || null;
}

async function findUserByEmail(supabase, normalizedEmail, email, currentUserId = null) {
    const candidates = new Map();

    if (normalizedEmail) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('normalized_email', normalizedEmail)
            .limit(10);

        if (error) {
            console.warn('Unable to query users by normalized email:', error.message);
        } else {
            for (const user of data || []) candidates.set(user.id, user);
        }
    }

    if (email) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(10);

        if (error) {
            console.warn('Unable to query users by email:', error.message);
        } else {
            for (const user of data || []) candidates.set(user.id, user);
        }
    }

    return pickBestCreditUser([...candidates.values()], currentUserId);
}

async function reconcileUserFromEmailMatch(supabase, currentUser, matchedUser, clerkUserId, email, normalizedEmail) {
    if (!matchedUser || matchedUser.id === currentUser.id) {
        return currentUser;
    }

    const currentCredits = numericValue(currentUser.credits_remaining);
    const matchedCredits = numericValue(matchedUser.credits_remaining);
    const currentPurchased = numericValue(currentUser.total_credits_purchased);
    const matchedPurchased = numericValue(matchedUser.total_credits_purchased);

    const updateData = {
        email: currentUser.email || email,
        normalized_email: currentUser.normalized_email || normalizedEmail,
        credits_remaining: Math.max(currentCredits, matchedCredits),
        total_credits_purchased: Math.max(currentPurchased, matchedPurchased),
        stripe_customer_id: currentUser.stripe_customer_id || matchedUser.stripe_customer_id || null,
        subscription_status: currentUser.subscription_status === 'free'
            ? (matchedUser.subscription_status || currentUser.subscription_status)
            : currentUser.subscription_status,
        updated_at: new Date().toISOString()
    };

    console.log('DB: Reconciling same-email Clerk account credits', {
        currentClerkUserId: clerkUserId,
        matchedClerkUserId: matchedUser.clerk_user_id,
        currentCredits,
        matchedCredits,
        reconciledCredits: updateData.credits_remaining
    });

    const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', currentUser.id)
        .select()
        .single();

    if (error) {
        console.warn('Unable to reconcile same-email user credits:', error.message);
        return currentUser;
    }

    return data;
}

// Database utility functions
const db = {
    // User management
    async createOrGetUser(clerkUserId, email) {
        try {
            console.log('🔍 DB: createOrGetUser called with:', { clerkUserId, email });
            const supabase = getSupabaseClient();
            console.log('🔍 DB: Got supabase client');

            // Normalize the email for storage (defense in depth)
            const normalizedEmail = normalizeEmail(email);
            console.log('🔍 DB: Normalized email:', normalizedEmail);

            // First try to get existing user - use maybeSingle() to handle 0 or 1 rows gracefully
            // Also use limit(1) in case there are duplicate rows (shouldn't happen but defensive)
            console.log('🔍 DB: About to query users table...');
            const { data: existingUsers, error: fetchError } = await supabase
                .from('users')
                .select('*')
                .eq('clerk_user_id', clerkUserId)
                .limit(1);

            const existingUser = existingUsers?.[0] || null;
            console.log('🔍 DB: Query completed. Data:', !!existingUser, 'Error:', fetchError?.message);

            if (existingUser && !fetchError) {
                console.log('🔍 DB: Found existing user, returning');
                const matchedUser = await findUserByEmail(supabase, normalizedEmail, email, existingUser.id);
                const reconciledUser = await reconcileUserFromEmailMatch(
                    supabase,
                    existingUser,
                    matchedUser,
                    clerkUserId,
                    email,
                    normalizedEmail
                );
                return { user: reconciledUser, created: false };
            }

            const sameEmailUser = await findUserByEmail(supabase, normalizedEmail, email);
            if (sameEmailUser && !fetchError) {
                console.log('DB: Found same-email user for new Clerk ID, migrating row');
                const { data: migratedUser, error: migrateError } = await supabase
                    .from('users')
                    .update({
                        clerk_user_id: clerkUserId,
                        email: sameEmailUser.email || email,
                        normalized_email: sameEmailUser.normalized_email || normalizedEmail,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', sameEmailUser.id)
                    .select()
                    .single();

                if (!migrateError && migratedUser) {
                    console.log('DB: Migrated same-email user to current Clerk ID');
                    return { user: migratedUser, created: false };
                }

                console.warn('Unable to migrate same-email user to current Clerk ID:', migrateError?.message);
            }

            // Create new user if doesn't exist (with 30 initial credits)
            // Use upsert with onConflict to handle race conditions
            // Store both original email and normalized email for burner detection
            console.log('🔍 DB: Creating new user with 30 initial credits...');
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .upsert({
                    clerk_user_id: clerkUserId,
                    email: email,
                    normalized_email: normalizedEmail,
                    subscription_status: 'free',
                    credits_remaining: 30,
                    total_credits_purchased: 0
                }, {
                    onConflict: 'clerk_user_id',
                    ignoreDuplicates: false
                })
                .select()
                .single();

            console.log('🔍 DB: Upsert completed. Data:', !!newUser, 'Error:', createError?.message);

            if (createError) {
                throw createError;
            }

            console.log('🔍 DB: Created/updated user with credits, returning');
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

            const { data: users, error } = await supabase
                .from('users')
                .select('credits_remaining, total_credits_purchased')
                .eq('clerk_user_id', clerkUserId)
                .limit(1);

            const user = users?.[0] || null;

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
                .limit(1);

            if (error) {
                throw error;
            }

            return data?.[0] || null;
        } catch (error) {
            console.error('Error updating Stripe customer ID:', error);
            throw error;
        }
    }
};

module.exports = { supabase: getSupabaseClient, getSupabaseClient, db, testConnection };

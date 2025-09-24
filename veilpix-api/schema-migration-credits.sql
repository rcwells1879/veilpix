-- 0. Ensure we operate on the public.users application table consistently
-- (No DDL; informational comment)

-- 1. Add credits columns to public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS credits_remaining INTEGER DEFAULT 30;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_credits_purchased INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_credit_purchase_at TIMESTAMP WITH TIME ZONE;

-- 2. Create credit_purchases tracking table in public schema
CREATE TABLE IF NOT EXISTS public.credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    clerk_user_id TEXT NOT NULL,
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT,
    credits_purchased INTEGER NOT NULL,
    amount_usd DECIMAL(10,2) NOT NULL,
    package_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 3. Drop anonymous_usage (optional)
DROP TABLE IF EXISTS public.anonymous_usage;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON public.credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_clerk_user_id ON public.credit_purchases(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_created_at ON public.credit_purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_users_credits_remaining ON public.users(credits_remaining);
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON public.users(clerk_user_id);

-- 5. Enable RLS on new table (schema-qualified)
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policy for credit purchases (ensure JWT claim matches clerk_user_id or adjust accordingly)
DROP POLICY IF EXISTS "Users can view own credit purchases" ON public.credit_purchases;
CREATE POLICY "Users can view own credit purchases" ON public.credit_purchases
    FOR SELECT TO authenticated USING (clerk_user_id = auth.jwt() ->> 'sub');

-- 7. Update existing users to have 30 credits if they don't already have credits
UPDATE users 
SET credits_remaining = 30 
WHERE credits_remaining IS NULL;

-- 8. Helper function to check user credits (schema-qualified, set search_path, SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.get_user_credits(p_clerk_user_id TEXT)
RETURNS INTEGER AS $$
BEGIN
    -- set empty search_path for security inside function
    PERFORM set_config('search_path', '', true);

    RETURN (
        SELECT COALESCE(credits_remaining, 0)
        FROM public.users
        WHERE clerk_user_id = p_clerk_user_id
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER STABLE;

-- 9. Function to deduct a credit (uses SELECT ... FOR UPDATE and returns boolean)
CREATE OR REPLACE FUNCTION public.deduct_user_credit(p_clerk_user_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    current_credits INTEGER;
BEGIN
    -- set empty search_path for security
    PERFORM set_config('search_path', '', true);

    -- Get current credits with row lock
    SELECT credits_remaining INTO current_credits
    FROM public.users
    WHERE clerk_user_id = p_clerk_user_id
    FOR UPDATE;

    -- Check if user has credits
    IF current_credits IS NULL OR current_credits <= 0 THEN
        RETURN FALSE;
    END IF;

    -- Deduct one credit
    UPDATE public.users
    SET credits_remaining = credits_remaining - 1,
        updated_at = NOW()
    WHERE clerk_user_id = p_clerk_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 10 Create function public.add_user_credits (schema-qualified, set search_path, SECURITY INVOKER) 
CREATE OR REPLACE FUNCTION public.add_user_credits(p_clerk_user_id TEXT, p_credits INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    -- set empty search_path for security
    PERFORM set_config('search_path', '', true);

    UPDATE public.users
    SET credits_remaining = COALESCE(credits_remaining, 0) + p_credits,
        total_credits_purchased = COALESCE(total_credits_purchased, 0) + p_credits,
        last_credit_purchase_at = NOW(),
        updated_at = NOW()
    WHERE clerk_user_id = p_clerk_user_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
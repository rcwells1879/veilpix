BEGIN;

ALTER TABLE public.users
    ALTER COLUMN credits_remaining TYPE NUMERIC(12,2)
    USING ROUND(COALESCE(credits_remaining, 0)::NUMERIC, 2),
    ALTER COLUMN credits_remaining SET DEFAULT 30.00;

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_credits_remaining_nonnegative;

ALTER TABLE public.users
    ADD CONSTRAINT users_credits_remaining_nonnegative
    CHECK (credits_remaining >= 0);

CREATE OR REPLACE FUNCTION public.deduct_user_credits(
    p_clerk_user_id TEXT,
    p_credits NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    normalized_credits NUMERIC(12,2);
BEGIN
    normalized_credits := ROUND(p_credits, 2);

    IF normalized_credits IS NULL OR normalized_credits <= 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.users
    SET credits_remaining = ROUND(credits_remaining - normalized_credits, 2),
        updated_at = CURRENT_TIMESTAMP
    WHERE clerk_user_id = p_clerk_user_id
      AND credits_remaining >= normalized_credits;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_user_credits(TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_user_credits(TEXT, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_user_credits(TEXT, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_user_credits(TEXT, NUMERIC) TO service_role;

COMMIT;

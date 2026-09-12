-- Apply before deploying the API that calls refund_user_credits.
-- Production application requires explicit operator approval.
BEGIN;

CREATE TABLE IF NOT EXISTS public.credit_refunds (
    clerk_user_id TEXT NOT NULL REFERENCES public.users(clerk_user_id) ON UPDATE CASCADE ON DELETE CASCADE,
    refund_id TEXT NOT NULL CHECK (length(btrim(refund_id)) > 0),
    credits NUMERIC(12,2) NOT NULL CHECK (credits > 0 AND credits <> 'NaN'::NUMERIC),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (clerk_user_id, refund_id)
);

ALTER TABLE public.credit_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credit_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.credit_refunds TO service_role;

CREATE OR REPLACE FUNCTION public.refund_user_credits(
    p_clerk_user_id TEXT,
    p_credits NUMERIC,
    p_refund_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    refund_amount NUMERIC(12,2);
    recorded_amount NUMERIC(12,2);
BEGIN
    IF p_credits IS NULL OR p_credits <= 0 OR p_credits IN ('NaN'::NUMERIC, 'Infinity'::NUMERIC)
       OR p_refund_id IS NULL OR length(btrim(p_refund_id)) = 0 THEN
        RAISE EXCEPTION 'A positive refund amount and refund ID are required';
    END IF;
    refund_amount := ROUND(p_credits, 2);
    IF refund_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount rounds to zero';
    END IF;

    -- Serialize refunds with other balance updates and verify the account.
    PERFORM 1 FROM public.users WHERE clerk_user_id = p_clerk_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    SELECT credits INTO recorded_amount FROM public.credit_refunds
    WHERE clerk_user_id = p_clerk_user_id AND refund_id = p_refund_id;
    IF FOUND THEN
        IF recorded_amount <> refund_amount THEN
            RAISE EXCEPTION 'Refund ID already exists with a different amount';
        END IF;
        RETURN TRUE;
    END IF;

    INSERT INTO public.credit_refunds (clerk_user_id, refund_id, credits)
    VALUES (p_clerk_user_id, p_refund_id, refund_amount);

    UPDATE public.users
    SET credits_remaining = ROUND(COALESCE(credits_remaining, 0) + refund_amount, 2),
        updated_at = CURRENT_TIMESTAMP
    WHERE clerk_user_id = p_clerk_user_id;
    -- A refund is not a purchase: preserve purchase totals and timestamps.
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_user_credits(TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_user_credits(TEXT, NUMERIC, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

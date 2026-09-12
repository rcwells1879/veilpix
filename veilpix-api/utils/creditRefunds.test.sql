-- Run only in an EMPTY, disposable LOCAL PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f utils/creditRefunds.test.sql
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.users (
    clerk_user_id TEXT UNIQUE NOT NULL,
    credits_remaining NUMERIC(12,2) NOT NULL,
    total_credits_purchased INTEGER NOT NULL DEFAULT 0,
    last_credit_purchase_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
GRANT SELECT, UPDATE ON public.users TO service_role;
\ir ../schema-migration-credit-refunds.sql
-- Reapplying the migration must preserve receipts.
\ir ../schema-migration-credit-refunds.sql

BEGIN;
INSERT INTO public.users VALUES ('user-a', 9.40, 200, '2026-08-31', CURRENT_TIMESTAMP);
INSERT INTO public.users VALUES ('user-b', 50, 0, NULL, CURRENT_TIMESTAMP);
SET LOCAL ROLE service_role;
DO $$
BEGIN
    ASSERT public.refund_user_credits('user-a', 8.43, 'video:first');
    ASSERT public.refund_user_credits('user-a', 12.17, 'video:second');
    ASSERT (SELECT credits_remaining = 30 FROM public.users WHERE clerk_user_id = 'user-a');
    ASSERT (SELECT total_credits_purchased = 200 AND last_credit_purchase_at = '2026-08-31'::TIMESTAMPTZ
            FROM public.users WHERE clerk_user_id = 'user-a');
    ASSERT public.refund_user_credits('user-a', 8.43, 'video:first');
    ASSERT (SELECT credits_remaining = 30 FROM public.users WHERE clerk_user_id = 'user-a');
    ASSERT (SELECT count(*) = 2 FROM public.credit_refunds WHERE clerk_user_id = 'user-a');
    ASSERT (SELECT credits_remaining = 50 FROM public.users WHERE clerk_user_id = 'user-b');
    ASSERT NOT public.refund_user_credits('missing-user', 8.43, 'video:missing');
    ASSERT NOT EXISTS (SELECT 1 FROM public.credit_refunds WHERE clerk_user_id = 'missing-user');
    BEGIN
        PERFORM public.refund_user_credits('user-a', 12.17, 'video:first');
        RAISE EXCEPTION 'Different amount for the same refund ID was accepted' USING ERRCODE = 'assert_failure';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    BEGIN
        PERFORM public.refund_user_credits('user-a', -8.43, 'video:negative');
        RAISE EXCEPTION 'Negative refund was accepted' USING ERRCODE = 'assert_failure';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    BEGIN
        PERFORM public.refund_user_credits('user-a', 'NaN'::NUMERIC, 'video:nan');
        RAISE EXCEPTION 'NaN refund was accepted' USING ERRCODE = 'assert_failure';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    ASSERT (SELECT credits_remaining = 30 FROM public.users WHERE clerk_user_id = 'user-a');
END;
$$;
RESET ROLE;
DO $$
BEGIN
    ASSERT NOT has_function_privilege('anon', 'public.refund_user_credits(text,numeric,text)', 'EXECUTE');
    ASSERT NOT has_function_privilege('authenticated', 'public.refund_user_credits(text,numeric,text)', 'EXECUTE');
    ASSERT NOT has_table_privilege('anon', 'public.credit_refunds', 'SELECT');
    ASSERT NOT has_table_privilege('authenticated', 'public.credit_refunds', 'INSERT');
END;
$$;
ROLLBACK;

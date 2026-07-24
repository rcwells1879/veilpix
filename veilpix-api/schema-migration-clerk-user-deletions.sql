-- Preserve account history while recording that the corresponding Clerk user
-- no longer exists. Apply this migration before enabling the Clerk webhook.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
    ON public.users(deleted_at)
    WHERE deleted_at IS NOT NULL;

BEGIN;

CREATE TABLE IF NOT EXISTS public.media_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID NOT NULL,
    clerk_user_id TEXT NOT NULL,
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('image', 'video', 'audio', 'file')),
    provider TEXT NOT NULL,
    storage_bucket TEXT NOT NULL DEFAULT 'media-deliveries',
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    size_bytes BIGINT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (clerk_user_id, generation_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_media_deliveries_pending_user
    ON public.media_deliveries (clerk_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_media_deliveries_expiry
    ON public.media_deliveries (expires_at)
    WHERE status = 'pending';

ALTER TABLE public.media_deliveries ENABLE ROW LEVEL SECURITY;

-- Media delivery rows are intentionally service-role only. Browser access is
-- mediated by authenticated API routes that issue short-lived signed URLs.
REVOKE ALL ON TABLE public.media_deliveries FROM anon;
REVOKE ALL ON TABLE public.media_deliveries FROM authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('media-deliveries', 'media-deliveries', FALSE, 536870912)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('provider-inputs', 'provider-inputs', FALSE, 104857600)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

COMMIT;

ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending';
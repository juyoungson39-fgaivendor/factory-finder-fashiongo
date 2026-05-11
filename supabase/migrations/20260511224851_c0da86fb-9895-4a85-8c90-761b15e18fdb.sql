-- 1) Enum type
DO $$ BEGIN
  CREATE TYPE public.match_status AS ENUM ('candidate','pending_confirm','approved','rejected','active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Columns
ALTER TABLE public.trend_sourceable_matches
  ADD COLUMN IF NOT EXISTS status public.match_status NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES auth.users(id);

-- 3) Index
CREATE INDEX IF NOT EXISTS idx_tsm_status
  ON public.trend_sourceable_matches (status, match_score DESC);

-- 4) Trigger to sync status meta
CREATE OR REPLACE FUNCTION public.sync_match_status_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
    NEW.status_changed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_match_status_meta ON public.trend_sourceable_matches;
CREATE TRIGGER trg_sync_match_status_meta
BEFORE UPDATE ON public.trend_sourceable_matches
FOR EACH ROW EXECUTE FUNCTION public.sync_match_status_meta();
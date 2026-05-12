
-- 1) Add 'unfiltered' to match_status enum
ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'unfiltered' BEFORE 'pending_confirm';

-- 2) Extend target_products schema
ALTER TABLE public.target_products
  ADD COLUMN IF NOT EXISTS trend_analysis_id UUID,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS target_products_trend_analysis_id_unique
  ON public.target_products(trend_analysis_id)
  WHERE trend_analysis_id IS NOT NULL;

-- Update source check to include agent_stage2
ALTER TABLE public.target_products DROP CONSTRAINT IF EXISTS target_products_source_check;
ALTER TABLE public.target_products
  ADD CONSTRAINT target_products_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'ai_suggested'::text, 'imported'::text, 'agent_stage2'::text]));

-- name is NOT NULL but stage2 inserts won't have one; provide a sensible default fallback
ALTER TABLE public.target_products ALTER COLUMN name SET DEFAULT 'Stage2 Auto Target';

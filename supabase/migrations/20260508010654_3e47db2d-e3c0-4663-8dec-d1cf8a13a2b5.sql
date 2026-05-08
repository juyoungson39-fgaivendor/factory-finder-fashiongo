
CREATE TABLE IF NOT EXISTS public.scoring_criteria_backup_20260507 AS
  SELECT * FROM public.scoring_criteria;

ALTER TABLE public.scoring_criteria
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS ai_auto_scores JSONB;

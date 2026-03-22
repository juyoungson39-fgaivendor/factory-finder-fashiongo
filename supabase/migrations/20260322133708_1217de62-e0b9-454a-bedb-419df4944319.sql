
ALTER TABLE public.factories 
  ADD COLUMN IF NOT EXISTS ai_original_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS ai_original_data jsonb;

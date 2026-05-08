ALTER TABLE public.trend_analyses
  ADD COLUMN IF NOT EXISTS classification_skipped_reason text;

CREATE INDEX IF NOT EXISTS idx_trend_analyses_skipped_reason_null
  ON public.trend_analyses (id)
  WHERE classification_skipped_reason IS NULL;
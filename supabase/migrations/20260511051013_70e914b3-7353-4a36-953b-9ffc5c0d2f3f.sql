
-- 1. Add columns
ALTER TABLE public.trend_analyses
  ADD COLUMN IF NOT EXISTS match_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_match_score numeric;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_trend_analyses_matched
  ON public.trend_analyses (top_match_score DESC NULLS LAST)
  WHERE top_match_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trend_analyses_match_count
  ON public.trend_analyses (match_count DESC);

-- 3. Backfill from trend_matches
UPDATE public.trend_analyses ta
SET
  match_count = sub.cnt,
  top_match_score = sub.max_score
FROM (
  SELECT
    trend_analysis_id,
    COUNT(*)::int AS cnt,
    MAX(match_score) AS max_score
  FROM public.trend_matches
  WHERE trend_analysis_id IS NOT NULL
  GROUP BY trend_analysis_id
) sub
WHERE ta.id = sub.trend_analysis_id;

-- 4. Trigger function — recompute on any change to trend_matches
CREATE OR REPLACE FUNCTION public.sync_trend_match_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
BEGIN
  target_id := COALESCE(NEW.trend_analysis_id, OLD.trend_analysis_id);
  IF target_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.trend_analyses ta
  SET
    match_count = COALESCE(sub.cnt, 0),
    top_match_score = sub.max_score
  FROM (
    SELECT COUNT(*)::int AS cnt, MAX(match_score) AS max_score
    FROM public.trend_matches
    WHERE trend_analysis_id = target_id
  ) sub
  WHERE ta.id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_trend_match_stats ON public.trend_matches;

CREATE TRIGGER trg_sync_trend_match_stats
AFTER INSERT OR UPDATE OR DELETE ON public.trend_matches
FOR EACH ROW EXECUTE FUNCTION public.sync_trend_match_stats();

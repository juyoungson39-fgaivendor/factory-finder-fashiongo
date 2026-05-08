DROP FUNCTION IF EXISTS public.update_factory_trend_scores(integer, double precision);
DROP TABLE IF EXISTS public.trend_backprop_runs;
ALTER TABLE public.factories DROP COLUMN IF EXISTS trend_match_score;
ALTER TABLE public.factories DROP COLUMN IF EXISTS trend_matched_count;
ALTER TABLE public.factories DROP COLUMN IF EXISTS trend_score_updated_at;
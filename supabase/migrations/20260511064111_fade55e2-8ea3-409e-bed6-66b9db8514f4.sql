
-- 1) New table
CREATE TABLE IF NOT EXISTS public.trend_sourceable_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_analysis_id uuid NOT NULL REFERENCES public.trend_analyses(id) ON DELETE CASCADE,
  sourceable_product_id uuid NOT NULL REFERENCES public.sourceable_products(id) ON DELETE CASCADE,
  match_score numeric NOT NULL,
  status text NOT NULL DEFAULT 'candidate',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trend_analysis_id, sourceable_product_id)
);

CREATE INDEX IF NOT EXISTS idx_tsm_trend ON public.trend_sourceable_matches(trend_analysis_id);
CREATE INDEX IF NOT EXISTS idx_tsm_product ON public.trend_sourceable_matches(sourceable_product_id);
CREATE INDEX IF NOT EXISTS idx_tsm_score ON public.trend_sourceable_matches(match_score DESC);

ALTER TABLE public.trend_sourceable_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read tsm" ON public.trend_sourceable_matches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages tsm" ON public.trend_sourceable_matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Move trigger: redefine sync_trend_match_stats to read from new table
CREATE OR REPLACE FUNCTION public.sync_trend_match_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    FROM public.trend_sourceable_matches
    WHERE trend_analysis_id = target_id
  ) sub
  WHERE ta.id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop old trigger from trend_matches (factory based)
DROP TRIGGER IF EXISTS trg_sync_trend_match_stats ON public.trend_matches;

-- Attach to new table
DROP TRIGGER IF EXISTS trg_sync_tsm_stats ON public.trend_sourceable_matches;
CREATE TRIGGER trg_sync_tsm_stats
AFTER INSERT OR UPDATE OR DELETE ON public.trend_sourceable_matches
FOR EACH ROW EXECUTE FUNCTION public.sync_trend_match_stats();

-- 3) Reset stale stats
UPDATE public.trend_analyses
SET match_count = 0, top_match_score = NULL
WHERE match_count IS NOT NULL OR top_match_score IS NOT NULL;

-- 4) New backfill RPC
CREATE OR REPLACE FUNCTION public.backfill_trend_sourceable_matches(p_threshold numeric DEFAULT 0.30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_trends int := 0;
  v_products int := 0;
  v_rows int := 0;
BEGIN
  SELECT COUNT(*) INTO v_trends
  FROM public.trend_analyses
  WHERE embedding IS NOT NULL AND status = 'analyzed';

  SELECT COUNT(*) INTO v_products
  FROM public.sourceable_products
  WHERE embedding IS NOT NULL;

  WITH scored AS (
    SELECT
      ta.id AS trend_analysis_id,
      sp.id AS sourceable_product_id,
      (1 - (ta.embedding <=> sp.embedding))::numeric AS score,
      ta.user_id AS uid
    FROM public.trend_analyses ta
    CROSS JOIN public.sourceable_products sp
    WHERE ta.embedding IS NOT NULL
      AND ta.status = 'analyzed'
      AND sp.embedding IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.trend_sourceable_matches
      (trend_analysis_id, sourceable_product_id, match_score, status, user_id)
    SELECT trend_analysis_id, sourceable_product_id, score, 'candidate', uid
    FROM scored
    WHERE score >= p_threshold
    ON CONFLICT (trend_analysis_id, sourceable_product_id) DO UPDATE
      SET match_score = EXCLUDED.match_score
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rows FROM ins;

  RETURN jsonb_build_object(
    'trends_with_emb', v_trends,
    'products_with_emb', v_products,
    'rows_upserted', v_rows,
    'threshold', p_threshold,
    'elapsed_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_stage3_full(p_threshold numeric DEFAULT 0.30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_started_at   timestamptz := clock_timestamp();
  v_trends       int := 0;
  v_products     int := 0;
  v_rows_touched int := 0;
  v_pending      int := 0;
  v_unfiltered   int := 0;
BEGIN
  SELECT COUNT(*) INTO v_trends
    FROM public.trend_analyses
   WHERE embedding IS NOT NULL AND status = 'analyzed';

  SELECT COUNT(*) INTO v_products
    FROM public.sourceable_products
   WHERE embedding IS NOT NULL;

  WITH scored AS (
    SELECT
      ta.id      AS trend_analysis_id,
      sp.id      AS sourceable_product_id,
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
    SELECT trend_analysis_id, sourceable_product_id, score, 'unfiltered', uid
      FROM scored
     WHERE score >= p_threshold
    ON CONFLICT (trend_analysis_id, sourceable_product_id) DO UPDATE
      SET match_score = EXCLUDED.match_score
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rows_touched FROM ins;

  SELECT pending_count, unfiltered_count
    INTO v_pending, v_unfiltered
    FROM public.run_stage3_pending_confirm();

  RETURN jsonb_build_object(
    'trends_with_emb',   v_trends,
    'products_with_emb', v_products,
    'rows_touched',      v_rows_touched,
    'pending_count',     v_pending,
    'unfiltered_count',  v_unfiltered,
    'threshold',         p_threshold,
    'elapsed_ms',        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int
  );
END;
$$;

COMMENT ON FUNCTION public.run_stage3_full(numeric) IS
  'Stage 3 full matching + classification (new). Cosine match trend × sourceable_product → UPSERT trend_sourceable_matches (new=unfiltered, existing status preserved) → call run_stage3_pending_confirm() for active target unfiltered → pending_confirm transition.';

GRANT EXECUTE ON FUNCTION public.run_stage3_full(numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
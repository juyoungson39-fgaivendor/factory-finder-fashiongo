CREATE OR REPLACE FUNCTION public.backfill_trend_matches(p_threshold numeric DEFAULT 0.30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_trends_considered int := 0;
  v_factories_with_emb int := 0;
  v_rows_upserted int := 0;
BEGIN
  CREATE TEMP TABLE _factory_emb ON COMMIT DROP AS
  SELECT sp.factory_id, AVG(sp.embedding)::vector AS emb
  FROM public.sourceable_products sp
  JOIN public.factories f ON f.id = sp.factory_id AND f.deleted_at IS NULL
  WHERE sp.embedding IS NOT NULL AND sp.factory_id IS NOT NULL
  GROUP BY sp.factory_id;

  SELECT COUNT(*) INTO v_factories_with_emb FROM _factory_emb;
  SELECT COUNT(*) INTO v_trends_considered
  FROM public.trend_analyses
  WHERE embedding IS NOT NULL AND status = 'analyzed';

  WITH scored AS (
    SELECT ta.id AS trend_analysis_id, fe.factory_id,
           (1 - (ta.embedding <=> fe.emb))::numeric AS score
    FROM public.trend_analyses ta
    CROSS JOIN _factory_emb fe
    WHERE ta.embedding IS NOT NULL AND ta.status = 'analyzed'
  ),
  ins AS (
    INSERT INTO public.trend_matches (trend_analysis_id, factory_id, match_score, status)
    SELECT trend_analysis_id, factory_id, score, 'candidate'
    FROM scored WHERE score >= p_threshold
    ON CONFLICT (trend_analysis_id, factory_id) DO UPDATE
      SET match_score = EXCLUDED.match_score
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rows_upserted FROM ins;

  RETURN jsonb_build_object(
    'trends_considered', v_trends_considered,
    'factories_with_emb', v_factories_with_emb,
    'rows_upserted', v_rows_upserted,
    'threshold', p_threshold,
    'elapsed_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '{}'::jsonb;
  v_factory_total integer;
  v_factory_total_prev integer;
  v_factory_avg numeric;
  v_top_name text;
  v_top_score numeric;
  v_count integer; v_prev_count integer;
  v_revenue numeric; v_prev_revenue numeric;
  v_accuracy numeric; v_prev_accuracy numeric;
BEGIN
  -- Factory metrics (alibaba source)
  BEGIN
    SELECT COUNT(*) INTO v_factory_total
    FROM factories
    WHERE COALESCE(source_platform, source_platform_default, 'alibaba') = 'alibaba'
      AND deleted_at IS NULL;

    SELECT COUNT(*) INTO v_factory_total_prev
    FROM factories
    WHERE COALESCE(source_platform, source_platform_default, 'alibaba') = 'alibaba'
      AND deleted_at IS NULL
      AND created_at < now() - interval '7 days';

    SELECT ROUND(AVG(GREATEST(COALESCE(stock_score,0), COALESCE(oem_score,0)))::numeric, 1)
      INTO v_factory_avg
    FROM factories
    WHERE COALESCE(source_platform, source_platform_default, 'alibaba') = 'alibaba'
      AND deleted_at IS NULL
      AND GREATEST(COALESCE(stock_score,0), COALESCE(oem_score,0)) > 0;

    SELECT name, GREATEST(COALESCE(stock_score,0), COALESCE(oem_score,0))
      INTO v_top_name, v_top_score
    FROM factories
    WHERE COALESCE(source_platform, source_platform_default, 'alibaba') = 'alibaba'
      AND deleted_at IS NULL
    ORDER BY GREATEST(COALESCE(stock_score,0), COALESCE(oem_score,0)) DESC NULLS LAST
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_factory_total := 0; v_factory_total_prev := 0; v_factory_avg := 0;
    v_top_name := NULL; v_top_score := 0;
  END;

  result := result || jsonb_build_object(
    'factory_total', COALESCE(v_factory_total,0),
    'factory_total_prev', COALESCE(v_factory_total_prev,0),
    'factory_avg_score', COALESCE(v_factory_avg,0),
    'top_factory_name', v_top_name,
    'top_factory_score', COALESCE(v_top_score,0)
  );

  -- New registrations (this week vs prev)
  BEGIN
    EXECUTE $q$ SELECT COUNT(*) FROM fg_listings WHERE registered_at >= now() - interval '7 days' AND status = 'live' $q$ INTO v_count;
    EXECUTE $q$ SELECT COUNT(*) FROM fg_listings WHERE registered_at >= now() - interval '14 days' AND registered_at < now() - interval '7 days' AND status = 'live' $q$ INTO v_prev_count;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      SELECT COUNT(*) INTO v_count FROM matches WHERE status = 'live' AND updated_at >= now() - interval '7 days';
      SELECT COUNT(*) INTO v_prev_count FROM matches WHERE status = 'live' AND updated_at >= now() - interval '14 days' AND updated_at < now() - interval '7 days';
    EXCEPTION WHEN OTHERS THEN v_count := 0; v_prev_count := 0; END;
  END;
  result := result || jsonb_build_object('registered_this_week', COALESCE(v_count,0), 'registered_prev_week', COALESCE(v_prev_count,0));

  -- GMV
  BEGIN
    EXECUTE $q$ SELECT COALESCE(SUM(revenue_usd),0) FROM vendor_sales WHERE sale_date >= now() - interval '7 days' $q$ INTO v_revenue;
    EXECUTE $q$ SELECT COALESCE(SUM(revenue_usd),0) FROM vendor_sales WHERE sale_date >= now() - interval '14 days' AND sale_date < now() - interval '7 days' $q$ INTO v_prev_revenue;
  EXCEPTION WHEN OTHERS THEN v_revenue := 0; v_prev_revenue := 0; END;
  result := result || jsonb_build_object('gmv_this_week', COALESCE(v_revenue,0), 'gmv_prev_week', COALESCE(v_prev_revenue,0));

  -- Match accuracy
  BEGIN
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status NOT IN ('rejected')) / NULLIF(COUNT(*),0), 1)
      INTO v_accuracy FROM matches WHERE created_at >= now() - interval '7 days';
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status NOT IN ('rejected')) / NULLIF(COUNT(*),0), 1)
      INTO v_prev_accuracy FROM matches WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN v_accuracy := 0; v_prev_accuracy := 0; END;
  result := result || jsonb_build_object('match_accuracy', COALESCE(v_accuracy,0), 'match_accuracy_prev', COALESCE(v_prev_accuracy,0));

  RETURN result;
END;
$function$;
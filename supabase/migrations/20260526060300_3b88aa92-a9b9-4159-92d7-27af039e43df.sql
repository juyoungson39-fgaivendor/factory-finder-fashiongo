CREATE OR REPLACE FUNCTION public.run_stage2_target_filtering()
 RETURNS TABLE(total_input integer, passed_1st_filter integer, passed_2nd_filter integer, active_targets integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total INT;
  v_1st INT;
  v_2nd INT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.trend_analyses
  WHERE status = 'analyzed';

  SELECT COUNT(*) INTO v_1st
  FROM public.trend_analyses
  WHERE status = 'analyzed'
    AND (
      source_data->>'platform' IN ('zara', 'amazon', 'shein')
      OR source_platform IN ('zara', 'amazon', 'shein')
    );

  INSERT INTO public.target_products (
    trend_analysis_id, name, source, status, category, created_at
  )
  SELECT
    ta.id,
    COALESCE(NULLIF(ta.primary_category, ''), 'Stage2 Auto Target'),
    'agent_stage2',
    'draft',
    ta.primary_category,
    now()
  FROM public.trend_analyses ta
  WHERE ta.status = 'analyzed'
    AND (
      ta.source_data->>'platform' IN ('zara', 'amazon', 'shein')
      OR ta.source_platform IN ('zara', 'amazon', 'shein')
    )
  ON CONFLICT (trend_analysis_id) WHERE (trend_analysis_id IS NOT NULL) DO NOTHING;

  WITH best_cats AS (
    SELECT category FROM public.get_fashiongo_bestseller_categories(30, 10)
  )
  UPDATE public.target_products tp
  SET status = 'active',
      activated_at = now()
  FROM public.trend_analyses ta
  WHERE tp.trend_analysis_id = ta.id
    AND ta.primary_category IN (SELECT category FROM best_cats)
    AND tp.status = 'draft'
    AND tp.source = 'agent_stage2';

  GET DIAGNOSTICS v_2nd = ROW_COUNT;

  RETURN QUERY
  SELECT
    v_total,
    v_1st,
    v_2nd,
    (SELECT COUNT(*)::INT FROM public.target_products WHERE status = 'active');
END;
$function$;
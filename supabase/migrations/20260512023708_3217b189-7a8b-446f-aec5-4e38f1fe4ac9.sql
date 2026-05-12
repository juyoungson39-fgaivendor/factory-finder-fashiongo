
-- ============================================================
-- get_fashiongo_bestseller_categories (PLACEHOLDER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_fashiongo_bestseller_categories(
  p_days INT DEFAULT 30,
  p_top_n INT DEFAULT 10
)
RETURNS TABLE(category TEXT, total_sales NUMERIC, rank INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- ============================================================
  -- TODO: 패션고 DB 연결 후 실제 베스트셀러 쿼리로 교체
  -- ============================================================
  -- 변경 위치: 아래 SELECT 절 전체를 실제 fashiongo 테이블 쿼리로 대체
  -- 예시:
  --   SELECT
  --     fg.category::TEXT AS category,
  --     SUM(fg.sales_amount)::NUMERIC AS total_sales,
  --     ROW_NUMBER() OVER (ORDER BY SUM(fg.sales_amount) DESC)::INT AS rank
  --   FROM fashiongo_orders fg
  --   WHERE fg.created_at >= NOW() - (p_days || ' days')::INTERVAL
  --   GROUP BY fg.category
  --   ORDER BY total_sales DESC
  --   LIMIT p_top_n;
  -- ============================================================
  -- 현재 placeholder: trend_analyses.primary_category 빈도 Top N
  SELECT
    ta.primary_category::TEXT AS category,
    COUNT(*)::NUMERIC          AS total_sales,
    (ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC))::INT AS rank
  FROM public.trend_analyses ta
  WHERE ta.primary_category IS NOT NULL
    AND ta.primary_category <> ''
    AND ta.status = 'analyzed'
    AND ta.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY ta.primary_category
  ORDER BY COUNT(*) DESC
  LIMIT p_top_n;
$$;

COMMENT ON FUNCTION public.get_fashiongo_bestseller_categories(INT, INT) IS
  'PLACEHOLDER: 패션고 DB 연결 후 실제 베스트셀러 쿼리로 교체 필요. 현재는 trend_analyses.primary_category 빈도 Top N 을 반환하여 2차 필터가 0건으로 떨어지지 않도록 안전판 적용.';

-- ============================================================
-- run_stage2_target_filtering
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_stage2_target_filtering()
RETURNS TABLE(
  total_input INT,
  passed_1st_filter INT,
  passed_2nd_filter INT,
  active_targets INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_1st INT;
  v_2nd INT;
BEGIN
  -- 전체 analyzed trend_analyses
  SELECT COUNT(*) INTO v_total
  FROM public.trend_analyses
  WHERE status = 'analyzed';

  -- 1차 필터 통과: zara/amazon/shein (source_data.platform 또는 source_platform 컬럼)
  SELECT COUNT(*) INTO v_1st
  FROM public.trend_analyses
  WHERE status = 'analyzed'
    AND (
      source_data->>'platform' IN ('zara', 'amazon', 'shein')
      OR source_platform IN ('zara', 'amazon', 'shein')
    );

  -- 1차 필터 통과한 항목들 모두 draft 로 INSERT (중복 방지)
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
  ON CONFLICT (trend_analysis_id) DO NOTHING;

  -- 2차 필터: 패션고 베스트셀러 카테고리에 해당하는 타겟 → active
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
$$;

-- ============================================================
-- run_stage3_pending_confirm
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_stage3_pending_confirm()
RETURNS TABLE(
  pending_count INT,
  unfiltered_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending INT;
  v_unfiltered INT;
BEGIN
  -- Step A: 기존 pending_confirm → unfiltered (clean slate)
  UPDATE public.trend_sourceable_matches
  SET status = 'unfiltered'
  WHERE status = 'pending_confirm';

  -- Step B: Stage 2 active 타겟 매칭만 pending_confirm 으로 복귀
  UPDATE public.trend_sourceable_matches tsm
  SET status = 'pending_confirm'
  FROM public.target_products tp
  WHERE tsm.trend_analysis_id = tp.trend_analysis_id
    AND tp.status = 'active'
    AND tsm.status = 'unfiltered';

  GET DIAGNOSTICS v_pending = ROW_COUNT;

  SELECT COUNT(*)::INT INTO v_unfiltered
  FROM public.trend_sourceable_matches
  WHERE status = 'unfiltered';

  RETURN QUERY SELECT v_pending, v_unfiltered;
END;
$$;

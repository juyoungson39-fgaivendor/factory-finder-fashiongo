
CREATE TABLE IF NOT EXISTS angel_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at timestamptz DEFAULT now(),
  triggered_by text DEFAULT 'manual' CHECK (triggered_by IN ('cron','manual','system')),
  triggered_by_user_id uuid REFERENCES profiles(user_id) ON DELETE SET NULL,
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  stages_executed smallint[] DEFAULT '{}',
  results jsonb DEFAULT '{}'::jsonb,
  duration_seconds integer,
  error_message text,
  notes text,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS aar_triggered_at_idx ON angel_agent_runs(triggered_at DESC);
ALTER TABLE angel_agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_rw_aar" ON angel_agent_runs;
CREATE POLICY "public_rw_aar" ON angel_agent_runs FOR ALL USING (true) WITH CHECK (true);

-- ============ get_dashboard_kpi ============
CREATE OR REPLACE FUNCTION get_dashboard_kpi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  v_count integer; v_prev_count integer;
  v_revenue numeric; v_prev_revenue numeric;
  v_accuracy numeric; v_prev_accuracy numeric;
BEGIN
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

  BEGIN
    EXECUTE $q$ SELECT COALESCE(SUM(revenue_usd),0) FROM vendor_sales WHERE sale_date >= now() - interval '7 days' $q$ INTO v_revenue;
    EXECUTE $q$ SELECT COALESCE(SUM(revenue_usd),0) FROM vendor_sales WHERE sale_date >= now() - interval '14 days' AND sale_date < now() - interval '7 days' $q$ INTO v_prev_revenue;
  EXCEPTION WHEN OTHERS THEN v_revenue := 0; v_prev_revenue := 0; END;
  result := result || jsonb_build_object('gmv_this_week', COALESCE(v_revenue,0), 'gmv_prev_week', COALESCE(v_prev_revenue,0));

  BEGIN
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status NOT IN ('rejected')) / NULLIF(COUNT(*),0), 1)
      INTO v_accuracy FROM matches WHERE created_at >= now() - interval '7 days';
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status NOT IN ('rejected')) / NULLIF(COUNT(*),0), 1)
      INTO v_prev_accuracy FROM matches WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN v_accuracy := 0; v_prev_accuracy := 0; END;
  result := result || jsonb_build_object('match_accuracy', COALESCE(v_accuracy,0), 'match_accuracy_prev', COALESCE(v_prev_accuracy,0));

  RETURN result;
END;
$$;

-- ============ get_target_coverage ============
CREATE OR REPLACE FUNCTION get_target_coverage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_total integer := 0;
  v_matched integer := 0;
  v_categories jsonb := '[]'::jsonb;
  v_avg_candidates numeric := 0;
  v_top_score numeric := 0;
  v_top_target text := '';
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_total FROM target_products WHERE status = 'active';
    IF v_total > 0 THEN
      SELECT COUNT(DISTINCT target_id) INTO v_matched FROM matches
       WHERE total_score >= 0.5 AND status IN ('candidate','approved','live');

      SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY (c->>'rate')::numeric DESC), '[]'::jsonb) INTO v_categories
      FROM (
        SELECT
          COALESCE(tp.category, '미분류') AS category,
          COUNT(DISTINCT tp.id) AS total,
          COUNT(DISTINCT m.target_id) AS matched,
          ROUND(100.0 * COUNT(DISTINCT m.target_id) / NULLIF(COUNT(DISTINCT tp.id),0), 1) AS rate
        FROM target_products tp
        LEFT JOIN matches m ON m.target_id = tp.id AND m.total_score >= 0.5
        WHERE tp.status = 'active'
        GROUP BY tp.category
      ) c;

      SELECT AVG(c) INTO v_avg_candidates FROM (
        SELECT COUNT(*) AS c FROM matches
        WHERE total_score >= 0.5 AND status IN ('candidate','approved','live')
        GROUP BY target_id
      ) sub;

      SELECT m.total_score, tp.name INTO v_top_score, v_top_target
      FROM matches m JOIN target_products tp ON tp.id = m.target_id
      WHERE m.total_score >= 0.5
      ORDER BY m.total_score DESC LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_total := 0; v_matched := 0;
  END;

  result := jsonb_build_object(
    'total_targets', v_total,
    'matched_targets', v_matched,
    'match_rate', CASE WHEN v_total > 0 THEN ROUND(100.0 * v_matched / v_total, 1) ELSE 0 END,
    'categories', v_categories,
    'avg_candidates', COALESCE(ROUND(v_avg_candidates,1), 0),
    'top_score', COALESCE(v_top_score, 0),
    'top_target', COALESCE(v_top_target, '')
  );
  RETURN result;
END;
$$;

-- ============ get_dashboard_attentions ============
CREATE OR REPLACE FUNCTION get_dashboard_attentions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alerts jsonb := '[]'::jsonb;
  v_cat record;
  v_count integer;
BEGIN
  BEGIN
    FOR v_cat IN (
      SELECT tp.category,
        COUNT(DISTINCT tp.id) AS total,
        ROUND(100.0 * COUNT(DISTINCT m.target_id) / NULLIF(COUNT(DISTINCT tp.id),0), 1) AS rate
      FROM target_products tp
      LEFT JOIN matches m ON m.target_id = tp.id AND m.total_score >= 0.5
      WHERE tp.status = 'active' AND tp.category IS NOT NULL
      GROUP BY tp.category
      HAVING COUNT(DISTINCT tp.id) >= 3 AND ROUND(100.0 * COUNT(DISTINCT m.target_id) / NULLIF(COUNT(DISTINCT tp.id),0), 1) < 50
      ORDER BY rate ASC LIMIT 3
    ) LOOP
      alerts := alerts || jsonb_build_array(jsonb_build_object(
        'level','warning','icon','📊',
        'message', v_cat.category || ' 카테고리 매칭률 ' || v_cat.rate || '% — 공장 보강 권장',
        'action_label','공장 추가','action_route','/factories/new'
      ));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN
    SELECT COUNT(*) INTO v_count FROM angel_agent_runs
     WHERE triggered_at >= now() - interval '24 hours' AND status = 'failed';
    IF v_count > 0 THEN
      alerts := alerts || jsonb_build_array(jsonb_build_object(
        'level','error','icon','⚠️',
        'message','최근 24시간 자동 실행 ' || v_count || '건 실패',
        'action_label','로그 확인','action_route','/admin/ai-tools'
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN
    SELECT COUNT(*) INTO v_count FROM factories
     WHERE source_platform = 'alibaba'
       AND (ai_scored_at IS NULL OR ai_scored_at < now() - interval '60 days');
    IF v_count > 0 THEN
      alerts := alerts || jsonb_build_array(jsonb_build_object(
        'level','info','icon','📅',
        'message','공장 ' || v_count || '건 60일+ 점수 갱신 필요',
        'action_label','재크롤','action_route','/factories'
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  BEGIN
    SELECT COUNT(*) INTO v_count FROM target_products WHERE status = 'active';
    IF v_count = 0 THEN
      alerts := alerts || jsonb_build_array(jsonb_build_object(
        'level','info','icon','🎯',
        'message','활성 타깃 0건 — AI 추천 또는 신규 정의 필요',
        'action_label','타깃 정의','action_route','/products/target-fg'
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN END;

  RETURN alerts;
END;
$$;

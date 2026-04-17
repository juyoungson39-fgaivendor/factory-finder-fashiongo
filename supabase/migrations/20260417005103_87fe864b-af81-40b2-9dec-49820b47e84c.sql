-- ============================================================
-- 1. sourcing_reports: AI 기반 주간 소싱 추천 리포트 저장
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sourcing_reports (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL,
  period_days  INTEGER      NOT NULL DEFAULT 7,
  report_data  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  summary      TEXT,
  generated_at TIMESTAMPTZ  DEFAULT now(),
  created_at   TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE public.sourcing_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON public.sourcing_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage"
  ON public.sourcing_reports FOR ALL
  USING (true);

CREATE INDEX IF NOT EXISTS idx_sourcing_reports_user_date
  ON public.sourcing_reports (user_id, generated_at DESC);

-- ============================================================
-- 2. trend backpropagation: factories 컬럼 + RPC + 감사 테이블
-- ============================================================
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS trend_match_score      NUMERIC(5,1)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trend_matched_count    INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trend_score_updated_at TIMESTAMPTZ   DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_factories_trend_match_score
  ON public.factories (trend_match_score DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.update_factory_trend_scores(
  period_days   int   DEFAULT 30,
  min_similarity float DEFAULT 0.3
)
RETURNS TABLE (
  factory_id      uuid,
  factory_name    text,
  trend_match_score  numeric,
  matched_count   int,
  updated         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_trends int;
BEGIN
  SELECT COUNT(*) INTO v_total_trends
  FROM public.trend_analyses
  WHERE embedding IS NOT NULL
    AND created_at >= NOW() - (period_days * INTERVAL '1 day');

  IF v_total_trends = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH trend_vecs AS (
    SELECT id AS trend_id, embedding
    FROM public.trend_analyses
    WHERE embedding IS NOT NULL
      AND created_at >= NOW() - (period_days * INTERVAL '1 day')
  ),
  prod_trend_sim AS (
    SELECT
      sp.factory_id,
      tv.trend_id,
      MAX(1 - (sp.embedding <=> tv.embedding))   AS best_similarity
    FROM public.sourceable_products sp
    CROSS JOIN trend_vecs tv
    WHERE sp.embedding IS NOT NULL
      AND sp.factory_id IS NOT NULL
      AND (1 - (sp.embedding <=> tv.embedding)) >= min_similarity
    GROUP BY sp.factory_id, tv.trend_id
  ),
  factory_stats AS (
    SELECT
      pts.factory_id,
      ROUND(AVG(pts.best_similarity)::numeric, 4)   AS avg_sim,
      COUNT(DISTINCT pts.trend_id)::int             AS matched_cnt
    FROM prod_trend_sim pts
    GROUP BY pts.factory_id
  ),
  upd AS (
    UPDATE public.factories f
    SET
      trend_match_score = ROUND(
        LEAST(100.0, GREATEST(0.0,
          (fs.avg_sim * 50.0) +
          (fs.matched_cnt::float8 / v_total_trends * 50.0)
        ))::numeric,
        1
      ),
      trend_matched_count    = fs.matched_cnt,
      trend_score_updated_at = NOW()
    FROM factory_stats fs
    WHERE f.id = fs.factory_id
      AND f.deleted_at IS NULL
    RETURNING
      f.id          AS factory_id,
      f.name        AS factory_name,
      f.trend_match_score,
      f.trend_matched_count
  )
  SELECT
    upd.factory_id,
    upd.factory_name,
    upd.trend_match_score,
    upd.trend_matched_count AS matched_count,
    true AS updated
  FROM upd;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_factory_trend_scores(int, float) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_factory_trend_scores(int, float) TO service_role;

CREATE TABLE IF NOT EXISTS public.trend_backprop_runs (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  period_days    INTEGER      NOT NULL DEFAULT 30,
  min_similarity NUMERIC(4,2) NOT NULL DEFAULT 0.3,
  factories_updated  INTEGER  NOT NULL DEFAULT 0,
  triggered_by   TEXT         NOT NULL DEFAULT 'manual'
                              CHECK (triggered_by IN ('manual', 'scheduled', 'batch')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_backprop_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view backprop runs"
  ON public.trend_backprop_runs FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_trend_backprop_runs_created_at
  ON public.trend_backprop_runs (created_at DESC);

-- ============================================================
-- 3. fg_buyer_signals: FashionGo 바이어 행동 시그널
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fg_buyer_signals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  signal_type     TEXT        NOT NULL
                              CHECK (signal_type IN ('view', 'click', 'wishlist', 'order', 'search')),
  product_category TEXT,
  keyword         TEXT,
  count           INTEGER     NOT NULL DEFAULT 1,
  signal_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  source_data     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fg_buyer_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signals"
  ON public.fg_buyer_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fg_buyer_signals_date
  ON public.fg_buyer_signals (signal_date DESC, signal_type);

CREATE INDEX IF NOT EXISTS idx_fg_buyer_signals_user
  ON public.fg_buyer_signals (user_id, signal_date DESC);

CREATE INDEX IF NOT EXISTS idx_fg_buyer_signals_category
  ON public.fg_buyer_signals (product_category)
  WHERE product_category IS NOT NULL;

CREATE OR REPLACE VIEW public.fg_signal_category_stats AS
SELECT
  user_id,
  product_category,
  SUM(CASE WHEN signal_type = 'view'     THEN count ELSE 0 END) AS view_count,
  SUM(CASE WHEN signal_type = 'click'    THEN count ELSE 0 END) AS click_count,
  SUM(CASE WHEN signal_type = 'wishlist' THEN count ELSE 0 END) AS wishlist_count,
  SUM(CASE WHEN signal_type = 'order'    THEN count ELSE 0 END) AS order_count,
  SUM(CASE WHEN signal_type = 'search'   THEN count ELSE 0 END) AS search_count,
  SUM(count)                                                      AS total_signals,
  MAX(signal_date)                                                AS last_signal_date
FROM public.fg_buyer_signals
WHERE signal_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id, product_category;
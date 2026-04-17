-- ============================================================
-- 트렌드 매칭 → 공장 스코어링 역전파
-- ============================================================
-- 역전파 경로:
--   trend_analyses.embedding (트렌드 벡터)
--   ↕ cosine similarity
--   sourceable_products.embedding (공장 상품 벡터)
--   ↓ factory_id 기준 집계
--   factories.trend_match_score 업데이트
-- ============================================================

-- ── 1. factories 테이블에 역전파 점수 컬럼 추가 ──────────────
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS trend_match_score      NUMERIC(5,1)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trend_matched_count    INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trend_score_updated_at TIMESTAMPTZ   DEFAULT NULL;

-- 인덱스: 점수순 정렬 최적화
CREATE INDEX IF NOT EXISTS idx_factories_trend_match_score
  ON public.factories (trend_match_score DESC NULLS LAST);

-- ============================================================
-- 2. RPC: update_factory_trend_scores
--
-- 동작:
--   1) 최근 period_days 일 내 trend_analyses (embedding 있는 것)
--   2) 각 trend × sourceable_product 조합의 cosine similarity 계산
--   3) min_similarity 이상인 (factory_id, trend_id) 쌍 수집
--   4) factory 별 avg_similarity + 매칭 트렌드 수로 0~100점 계산
--      점수 = (avg_similarity × 50) + (matched_trends / total_trends × 50)
--   5) factories 테이블 업데이트 후 결과 반환
-- ============================================================
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
  -- 기간 내 유효 트렌드 수 (분모)
  SELECT COUNT(*) INTO v_total_trends
  FROM public.trend_analyses
  WHERE embedding IS NOT NULL
    AND created_at >= NOW() - (period_days * INTERVAL '1 day');

  IF v_total_trends = 0 THEN
    RETURN;   -- 트렌드 데이터 없음 → 업데이트 없이 종료
  END IF;

  -- 역전파 집계 CTE
  WITH trend_vecs AS (
    -- 최근 N일 이내, embedding 있는 트렌드
    SELECT id AS trend_id, embedding
    FROM public.trend_analyses
    WHERE embedding IS NOT NULL
      AND created_at >= NOW() - (period_days * INTERVAL '1 day')
  ),

  prod_trend_sim AS (
    -- 각 (공장 상품, 트렌드) 쌍의 최고 유사도
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
    -- 공장별 평균 유사도 + 매칭 트렌드 수
    SELECT
      factory_id,
      ROUND(AVG(best_similarity)::numeric, 4)   AS avg_sim,
      COUNT(DISTINCT trend_id)::int              AS matched_cnt
    FROM prod_trend_sim
    GROUP BY factory_id
  )

  -- UPDATE + 결과 반환
  UPDATE public.factories f
  SET
    trend_match_score      = ROUND(
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
    f.trend_matched_count  AS matched_count,
    true                   AS updated;

END;
$$;

-- ============================================================
-- 3. RLS / 권한: authenticated 사용자는 SELECT만 가능
--    실행은 service_role (Edge Function) 또는 서버측만 허용
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.update_factory_trend_scores(int, float)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_factory_trend_scores(int, float)
  TO service_role;

-- ============================================================
-- 4. 역전파 이력 테이블 (선택적 감사 로그)
-- ============================================================
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

-- Service Role은 RLS 우회 → 별도 정책 불필요

CREATE INDEX IF NOT EXISTS idx_trend_backprop_runs_created_at
  ON public.trend_backprop_runs (created_at DESC);

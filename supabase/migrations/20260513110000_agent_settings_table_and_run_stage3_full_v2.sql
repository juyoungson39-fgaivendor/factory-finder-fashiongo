-- ============================================================
-- Angel Agent 운영 파라미터 관리 인프라 + run_stage3_full v2
-- ============================================================
-- (1) agent_settings 테이블 신규 생성 — singleton, admin 만 수정
-- (2) run_stage3_full CREATE OR REPLACE — cold-start timeout 안전장치
--
-- 비파괴성:
--   - 기존 system_settings 테이블 미수정 (별도 신규 테이블)
--   - 기존 run_stage3_pending_confirm, backfill_trend_sourceable_matches 미수정
--   - 기존 trend_sourceable_matches 스키마/RLS/트리거 미변경
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- (1) agent_settings 테이블 (system_settings 의 검증된 singleton 패턴 모방)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  stage3_match_threshold numeric NOT NULL DEFAULT 0.60
    CHECK (stage3_match_threshold BETWEEN 0 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT agent_settings_only_one_row CHECK (id = 1)
);

COMMENT ON TABLE public.agent_settings IS
  'Angel Agent 운영 파라미터 (singleton, id=1). admin 만 수정 가능. 신규 stage 설정 추가 시 컬럼 추가.';

COMMENT ON COLUMN public.agent_settings.stage3_match_threshold IS
  'Stage 3 매칭 유사도 컷오프. 0.0~1.0. 낮을수록 매칭 수 ↑ (약한 매칭 포함), 높을수록 매칭 수 ↓ (강한 매칭만). 권장 0.50~0.70.';

INSERT INTO public.agent_settings (id, stage3_match_threshold)
VALUES (1, 0.60)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- (2) RLS — authenticated 는 read, admin 만 update
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.agent_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_settings_select_authenticated" ON public.agent_settings;
CREATE POLICY "agent_settings_select_authenticated"
  ON public.agent_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "agent_settings_update_admin" ON public.agent_settings;
CREATE POLICY "agent_settings_update_admin"
  ON public.agent_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- INSERT 는 마이그레이션에서 끝났으니 일반 사용자 차단 (singleton 보장).
-- DELETE 정책 없음 → 누구도 삭제 불가.

-- updated_at 자동 갱신 트리거 (admin UPDATE 시 자동 기록)
CREATE OR REPLACE FUNCTION public.touch_agent_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_settings_touch ON public.agent_settings;
CREATE TRIGGER trg_agent_settings_touch
  BEFORE UPDATE ON public.agent_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_settings_updated_at();

-- ─────────────────────────────────────────────────────────────
-- (3) run_stage3_full v2 — cold-start statement_timeout 안전장치 추가
--     본문 로직 동일, SET LOCAL 1줄만 추가
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_stage3_full(p_threshold numeric DEFAULT 0.60)
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
  -- cold-start CROSS JOIN 이 PostgREST 기본 8초 statement_timeout 에 걸리는 것을 방지.
  -- 이 트랜잭션에만 적용, 세션/DB 글로벌 설정은 변경 없음.
  SET LOCAL statement_timeout = '120s';

  -- 1) 매칭 가능한 trend / sourceable_product 카운트 (embedding 보유분만)
  SELECT COUNT(*) INTO v_trends
    FROM public.trend_analyses
   WHERE embedding IS NOT NULL AND status = 'analyzed';

  SELECT COUNT(*) INTO v_products
    FROM public.sourceable_products
   WHERE embedding IS NOT NULL;

  -- 2) cosine similarity 매칭 → UPSERT (신규는 status='unfiltered', 기존 status 보존)
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

  -- 3) 기존 RPC 재사용: unfiltered → pending_confirm (active 타겟 한정)
  SELECT pending_count, unfiltered_count
    INTO v_pending, v_unfiltered
    FROM public.run_stage3_pending_confirm();

  -- 4) 결과 (jsonb)
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
  'Stage 3 풀 매칭 + 분류 v2. v1 대비 SET LOCAL statement_timeout=120s 추가 (cold-start 방지). default threshold 0.60.';

GRANT EXECUTE ON FUNCTION public.run_stage3_full(numeric) TO authenticated;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

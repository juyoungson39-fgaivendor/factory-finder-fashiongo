-- ============================================================
-- run_stage3_full — Stage 3 풀 매칭 + 분류 (신규 RPC)
-- ============================================================
-- 흐름:
--   (1) trend_analyses(analyzed, embedding 보유) × sourceable_products(embedding 보유)
--       → pgvector cosine similarity (1 - <=>)
--       → 임계값 이상만 trend_sourceable_matches 에 UPSERT
--       → 신규 INSERT 는 status='unfiltered' (현재 enum 호환 + Step B 가 받아주는 값)
--       → ON CONFLICT 시 match_score 만 갱신, status / user_id 는 보존
--          (사용자가 이미 approved/rejected/active 처리한 row 는 안 건드림)
--   (2) 기존 run_stage3_pending_confirm() 호출
--       → unfiltered → pending_confirm (target_products.status='active' 한정)
--
-- 비파괴성:
--   - 기존 함수 미수정: backfill_trend_sourceable_matches, run_stage3_pending_confirm
--   - 기존 테이블 스키마 미변경
--   - 기존 enum 미변경
--   - 기존 데이터 미삭제
--
-- 트리거 상호작용 (검증 완료):
--   - trg_sync_match_status_meta (BEFORE UPDATE): match_score 만 SET → status 안 바꾸므로 no-op
--   - trg_sync_tsm_stats (AFTER INSERT/UPDATE/DELETE per row): row 당 1회 fire,
--     trend_analyses.match_count/top_match_score 자동 동기화.
--     1만 row 미만 규모는 무난 (현재 trend ≤300 × sourceable ≤1000 가정).
-- ============================================================

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
      -- 주의: status / user_id 는 ON CONFLICT 시 건드리지 않음.
      --       이미 pending_confirm/approved/rejected/active 인 row 의
      --       사용자 분류 결과를 unfiltered 로 되돌리지 않기 위함.
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
    'rows_touched',      v_rows_touched,   -- 신규 INSERT + ON CONFLICT UPDATE 합계
    'pending_count',     v_pending,        -- active 타겟에 묶여 pending_confirm 으로 승격된 수
    'unfiltered_count',  v_unfiltered,     -- 남은 unfiltered 수
    'threshold',         p_threshold,
    'elapsed_ms',        EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int
  );
END;
$$;

COMMENT ON FUNCTION public.run_stage3_full(numeric) IS
  'Stage 3 풀 매칭 + 분류 (신규). trend × sourceable_product cosine 매칭으로 trend_sourceable_matches UPSERT(신규=unfiltered, 기존 status 보존) → 기존 run_stage3_pending_confirm() 호출하여 active 타겟의 unfiltered → pending_confirm 전이. backfill_trend_sourceable_matches / run_stage3_pending_confirm / trend_sourceable_matches 미수정.';

GRANT EXECUTE ON FUNCTION public.run_stage3_full(numeric) TO authenticated;

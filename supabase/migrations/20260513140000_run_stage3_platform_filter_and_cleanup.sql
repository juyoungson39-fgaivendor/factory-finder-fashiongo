-- ============================================================
-- run_stage3_full v3 — 플랫폼 필터 추가 + 잔재 매칭 cleanup
-- ============================================================
-- 사용자 정책:
--   "shein/zara/amazon 만 타겟 상품에 오는거고, 위 플랫폼 외에서 오는
--    트렌드 매칭은 발생할 수 없음"
--
-- 현재 버그:
--   기존 run_stage3_full v2 는 매칭 CROSS JOIN 에 플랫폼 필터가 없어서
--   magazine/sns/pinterest 등 모든 analyzed 트렌드가 매칭에 포함됨.
--   결과: trend_sourceable_matches 에 13,895건의 잘못된 잔재 매칭 누적
--         (전부 unfiltered 상태, UI 노출 0건, approved/active 영향 0건).
--
-- 이번 변경:
--   (1) 잔재 매칭 13,895건 DELETE (cleanup)
--   (2) run_stage3_full v3 CREATE OR REPLACE — 매칭 WHERE 절에 플랫폼 필터 추가
--       이후 [실행하기] 부터는 비-허용 플랫폼 트렌드 매칭 안 만들어짐.
--
-- 비파괴성:
--   - 기존 시스템 미수정: trend_sourceable_matches 스키마/RLS/트리거 그대로
--   - 기존 RPC 미수정: run_stage3_pending_confirm 그대로 재사용
--   - 우리가 만든 함수 run_stage3_full 만 CREATE OR REPLACE
--   - DELETE 는 unfiltered 만 영향 (approved/rejected/active 영향 0건 사전 확인됨)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- (1) 잔재 매칭 cleanup
--     비-허용 플랫폼 트렌드에서 만들어진 매칭 일괄 삭제.
--     사전 확인: 13,895건 전부 status='unfiltered' (UI 노출 0).
--     trend_match_vendor_allocations 의 행은 ON DELETE CASCADE 로 같이 정리됨.
-- ─────────────────────────────────────────────────────────────
DELETE FROM public.trend_sourceable_matches tsm
WHERE EXISTS (
  SELECT 1
    FROM public.trend_analyses ta
   WHERE ta.id = tsm.trend_analysis_id
     AND COALESCE(ta.source_data->>'platform', '') NOT IN ('shein','zara','amazon')
     AND COALESCE(ta.source_platform, '')         NOT IN ('shein','zara','amazon')
);

-- ─────────────────────────────────────────────────────────────
-- (2) run_stage3_full v3 — 매칭 CROSS JOIN 에 플랫폼 필터 추가
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
  SET LOCAL statement_timeout = '120s';

  -- 1) 매칭 가능한 trend / sourceable_product 카운트 (embedding + 플랫폼 필터)
  SELECT COUNT(*) INTO v_trends
    FROM public.trend_analyses
   WHERE embedding IS NOT NULL
     AND status = 'analyzed'
     AND (source_data->>'platform' IN ('shein','zara','amazon')
          OR source_platform IN ('shein','zara','amazon'));

  SELECT COUNT(*) INTO v_products
    FROM public.sourceable_products
   WHERE embedding IS NOT NULL;

  -- 2) cosine similarity 매칭 → UPSERT
  --    ★ 플랫폼 필터 추가 (Stage 2 run_stage2_target_filtering 와 동일 정책):
  --       shein / zara / amazon 트렌드만 매칭에 포함.
  --       비-허용 플랫폼 트렌드는 매칭 안 만들어짐.
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
      AND (
        ta.source_data->>'platform' IN ('shein','zara','amazon')
        OR ta.source_platform        IN ('shein','zara','amazon')
      )
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
  'Stage 3 매칭 v3 — v2 대비 매칭 CROSS JOIN 에 shein/zara/amazon 플랫폼 필터 추가. 비-허용 플랫폼 트렌드는 매칭 안 만들어짐. statement_timeout 120s 안전장치 유지.';

GRANT EXECUTE ON FUNCTION public.run_stage3_full(numeric) TO authenticated;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

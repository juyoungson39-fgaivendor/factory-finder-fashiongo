-- ============================================================
-- trend_match_vendor_allocations
-- ============================================================
-- Stage 5 (벤더 배분) 인프라.
-- 매칭(trend_sourceable_matches) ↔ 벤더(vendor-config.ts slug) 의
-- N:M 관계를 표현. 한 매칭이 여러 벤더에 동시 배분 가능.
--
-- 비파괴성:
--   - 기존 trend_sourceable_matches 스키마/RLS/트리거/인덱스 미변경
--   - 기존 함수·enum 미변경
--   - 신규 테이블 + RLS + 인덱스만 추가
--
-- 정책 (Q1·Q2 결정 사항 반영):
--   - 활성 매칭도 벤더 편집 자유 (Q1=B) — DB 레벨 차단 없음
--   - 보류된 매칭의 기존 배분 보존 (Q2=A) — 자동 DELETE 트리거 없음
--   - 매칭 자체가 삭제되면 ON DELETE CASCADE 로 배분도 같이 삭제
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trend_match_vendor_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL
    REFERENCES public.trend_sourceable_matches(id) ON DELETE CASCADE,
  vendor_id text NOT NULL,          -- vendor-config.ts slug ('basic'/'trend'/'custom-{ts}')
  vendor_name text,                 -- 스냅샷 ('Sassy Look', 'G1K') — 카탈로그 변경 시 이력 보존
  allocated_at timestamptz NOT NULL DEFAULT now(),
  allocated_by uuid REFERENCES auth.users(id),
  notes text,                       -- 향후 메모용 (현재 미사용)
  UNIQUE (match_id, vendor_id)      -- 동일 매칭에 동일 벤더 중복 배분 방지
);

COMMENT ON TABLE public.trend_match_vendor_allocations IS
  'Stage 5 벤더 배분: 매칭 ↔ 벤더 N:M. vendor_id 는 vendor-config.ts 의 slug. 활성 매칭도 편집 자유, 보류 시 자동 삭제 없음.';

CREATE INDEX IF NOT EXISTS idx_tmva_match
  ON public.trend_match_vendor_allocations(match_id);
CREATE INDEX IF NOT EXISTS idx_tmva_vendor
  ON public.trend_match_vendor_allocations(vendor_id);

ALTER TABLE public.trend_match_vendor_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tmva_select_authenticated" ON public.trend_match_vendor_allocations;
CREATE POLICY "tmva_select_authenticated"
  ON public.trend_match_vendor_allocations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tmva_insert_authenticated" ON public.trend_match_vendor_allocations;
CREATE POLICY "tmva_insert_authenticated"
  ON public.trend_match_vendor_allocations
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tmva_delete_authenticated" ON public.trend_match_vendor_allocations;
CREATE POLICY "tmva_delete_authenticated"
  ON public.trend_match_vendor_allocations
  FOR DELETE TO authenticated USING (true);

-- UPDATE 정책 없음 — 변경 필요시 DELETE + INSERT.
--   이유: vendor_id 변경은 사실상 다른 row 이고,
--        notes 등 메타 컬럼은 현재 사용처 없음.

NOTIFY pgrst, 'reload schema';

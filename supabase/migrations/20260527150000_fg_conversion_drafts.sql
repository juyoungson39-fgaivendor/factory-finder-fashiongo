-- ============================================================
-- fg_conversion_drafts — Stage 6 (패션고 변환) 중간 데이터
-- ============================================================
-- active (벤더 배분 완료) 매칭을 FashionGo 등록 포맷으로 변환한
-- 중간 draft 를 보관. 사용자가 검토·수정·확정.
--
-- 설계 결정:
--   - 매칭 1건당 draft 1개 (UNIQUE match_id).
--     사용자 확인: "벤더별 FG 등록 데이터 항목 호환" → 벤더 공유.
--   - FG 필드 13개는 FGDataConvertDialog 의 FG_FIELDS 와 동일.
--   - match_status enum 미변경 — 변환 완료는 이 테이블 status 로 추적.
--
-- 비파괴성:
--   - 기존 trend_sourceable_matches / trend_match_vendor_allocations 미수정
--   - 기존 fg_registered_products (Stage 7 최종 등록) 미수정
--   - 신규 테이블 + RLS + 인덱스만 추가
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fg_conversion_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE
    REFERENCES public.trend_sourceable_matches(id) ON DELETE CASCADE,

  -- FashionGo 등록 필드 (FG_FIELDS 13개)
  item_name   text,
  style_no    text,
  category    text,
  unit_price  numeric,
  msrp        numeric,
  color_size  text,
  material    text,
  weight_kg   numeric,
  made_in     text DEFAULT 'China',
  pack        text DEFAULT 'Open-pack',
  min_qty     integer DEFAULT 6,
  description text,
  fg_status   text DEFAULT 'Active',     -- FG 상품 상태 (Active/Inactive/Discontinued)

  -- 변환 메타
  converted_image_url text,              -- 모델 합성 이미지 (선택)
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','confirmed')),  -- draft: 편집중, confirmed: 확정

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.fg_conversion_drafts IS
  'Stage 6 패션고 변환 중간 draft. 매칭 1건당 1 draft (벤더 공유). status=confirmed 면 FG 등록(Stage 7) 대기. match_status enum 미사용.';

CREATE INDEX IF NOT EXISTS idx_fcd_match  ON public.fg_conversion_drafts(match_id);
CREATE INDEX IF NOT EXISTS idx_fcd_status ON public.fg_conversion_drafts(status);

ALTER TABLE public.fg_conversion_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcd_select_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_select_authenticated"
  ON public.fg_conversion_drafts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fcd_insert_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_insert_authenticated"
  ON public.fg_conversion_drafts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fcd_update_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_update_authenticated"
  ON public.fg_conversion_drafts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fcd_delete_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_delete_authenticated"
  ON public.fg_conversion_drafts FOR DELETE TO authenticated USING (true);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.touch_fcd_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fcd_touch ON public.fg_conversion_drafts;
CREATE TRIGGER trg_fcd_touch
  BEFORE UPDATE ON public.fg_conversion_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_fcd_updated_at();

NOTIFY pgrst, 'reload schema';

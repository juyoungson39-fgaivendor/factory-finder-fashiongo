-- URL 메타
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS shop_id text;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS offer_id text;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS province text;

-- 파트너십
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS fg_partner boolean DEFAULT false;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS alibaba_detected boolean DEFAULT false;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS alibaba_url text;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS inventory_self_report integer;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS survey_completed_at timestamptz;

-- Phase 0 필수 재스코어링 (3지표)
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p0_inventory_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p0_us_target_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p0_price_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p0_completed_at timestamptz;

-- Phase 1 AI 자동 (6지표)
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p1_self_shipping_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p1_image_quality_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p1_moq_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p1_lead_time_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p1_communication_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p1_variety_score numeric(4,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p1_crawled_at timestamptz;

-- Phase 3 참고
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS p3_other_platforms_score numeric(4,2);

-- 스코어링 상태
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS score_status text DEFAULT 'new';
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS score_1st numeric(5,2);
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS ai_scored_at timestamptz;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS scored_at timestamptz;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS reviewer_id text;

-- CHECK 제약 (이미 있으면 skip)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p0_inventory_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p0_inventory_score_range CHECK (p0_inventory_score IS NULL OR (p0_inventory_score >= 0 AND p0_inventory_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p0_us_target_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p0_us_target_score_range CHECK (p0_us_target_score IS NULL OR (p0_us_target_score >= 0 AND p0_us_target_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p0_price_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p0_price_score_range CHECK (p0_price_score IS NULL OR (p0_price_score >= 0 AND p0_price_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p1_self_shipping_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p1_self_shipping_score_range CHECK (p1_self_shipping_score IS NULL OR (p1_self_shipping_score >= 0 AND p1_self_shipping_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p1_image_quality_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p1_image_quality_score_range CHECK (p1_image_quality_score IS NULL OR (p1_image_quality_score >= 0 AND p1_image_quality_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p1_moq_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p1_moq_score_range CHECK (p1_moq_score IS NULL OR (p1_moq_score >= 0 AND p1_moq_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p1_lead_time_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p1_lead_time_score_range CHECK (p1_lead_time_score IS NULL OR (p1_lead_time_score >= 0 AND p1_lead_time_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p1_communication_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p1_communication_score_range CHECK (p1_communication_score IS NULL OR (p1_communication_score >= 0 AND p1_communication_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p1_variety_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p1_variety_score_range CHECK (p1_variety_score IS NULL OR (p1_variety_score >= 0 AND p1_variety_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_p3_other_platforms_score_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_p3_other_platforms_score_range CHECK (p3_other_platforms_score IS NULL OR (p3_other_platforms_score >= 0 AND p3_other_platforms_score <= 10));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_score_1st_range') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_score_1st_range CHECK (score_1st IS NULL OR (score_1st >= 0 AND score_1st <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_score_status_check') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_score_status_check CHECK (score_status IN ('new','p1_crawling','ai_scored','p0_reviewing','scored','blocked','error'));
  END IF;
END $$;

-- 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS factories_shop_id_unique_idx ON public.factories (shop_id) WHERE shop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS factories_score_status_score_1st_idx ON public.factories (score_status, score_1st DESC);
CREATE INDEX IF NOT EXISTS factories_fg_partner_idx ON public.factories (fg_partner) WHERE fg_partner = true;
CREATE INDEX IF NOT EXISTS factories_alibaba_detected_idx ON public.factories (alibaba_detected) WHERE alibaba_detected = true;
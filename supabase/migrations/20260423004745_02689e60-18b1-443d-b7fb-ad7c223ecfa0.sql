-- Add 1688 raw crawler data columns to factories table (idempotent)
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS raw_service_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS raw_return_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS raw_product_count integer,
  ADD COLUMN IF NOT EXISTS raw_years_in_business integer,
  ADD COLUMN IF NOT EXISTS raw_crawl_data jsonb DEFAULT '{}'::jsonb;

-- Add CHECK constraints (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_raw_service_score_check') THEN
    ALTER TABLE public.factories
      ADD CONSTRAINT factories_raw_service_score_check
      CHECK (raw_service_score IS NULL OR (raw_service_score BETWEEN 0 AND 5));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_raw_return_rate_check') THEN
    ALTER TABLE public.factories
      ADD CONSTRAINT factories_raw_return_rate_check
      CHECK (raw_return_rate IS NULL OR (raw_return_rate BETWEEN 0 AND 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_raw_product_count_check') THEN
    ALTER TABLE public.factories
      ADD CONSTRAINT factories_raw_product_count_check
      CHECK (raw_product_count IS NULL OR raw_product_count >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_raw_years_in_business_check') THEN
    ALTER TABLE public.factories
      ADD CONSTRAINT factories_raw_years_in_business_check
      CHECK (raw_years_in_business IS NULL OR raw_years_in_business >= 0);
  END IF;
END $$;

-- Add column comments
COMMENT ON COLUMN public.factories.raw_service_score IS '1688 店铺服务分 (5점 만점)';
COMMENT ON COLUMN public.factories.raw_return_rate IS '1688 店铺回头率 (%)';
COMMENT ON COLUMN public.factories.raw_product_count IS '1688 등록 상품 수';
COMMENT ON COLUMN public.factories.raw_years_in_business IS '1688 入驻년수';
COMMENT ON COLUMN public.factories.raw_crawl_data IS '1688 크롤러가 추출한 전체 원본 데이터 (정시발송률/긍정평가율/팬수/설립년/가격분포/소량주문 시그널 등)';

-- Index for fast filtering by service score
CREATE INDEX IF NOT EXISTS idx_factories_raw_service
  ON public.factories(raw_service_score)
  WHERE raw_service_score IS NOT NULL;
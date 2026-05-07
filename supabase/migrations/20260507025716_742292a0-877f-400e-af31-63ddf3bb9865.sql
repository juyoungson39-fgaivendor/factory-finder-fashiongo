ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS supplier_capabilities JSONB;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS verified_report_data JSONB;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS use_case_recommendation text;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS stock_score numeric;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS oem_score numeric;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'factories_use_case_recommendation_check'
  ) THEN
    ALTER TABLE public.factories
      ADD CONSTRAINT factories_use_case_recommendation_check
      CHECK (use_case_recommendation IS NULL OR use_case_recommendation IN ('stock', 'oem', 'both', 'unknown'));
  END IF;
END $$;
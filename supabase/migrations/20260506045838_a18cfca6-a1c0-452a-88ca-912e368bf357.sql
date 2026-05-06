-- [1] Backup + clear
DROP TABLE IF EXISTS public.factories_backup_alibaba_pivot;
CREATE TABLE public.factories_backup_alibaba_pivot AS SELECT * FROM public.factories;

DELETE FROM public.factory_scores;
DELETE FROM public.scoring_corrections;
DELETE FROM public.sourceable_products WHERE factory_id IN (SELECT id FROM public.factories);
DELETE FROM public.manual_crawl_queue;
DELETE FROM public.factories;

-- [2] Alibaba-centric columns
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS alibaba_supplier_id text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factories_alibaba_supplier_id_key') THEN
    ALTER TABLE public.factories ADD CONSTRAINT factories_alibaba_supplier_id_key UNIQUE (alibaba_supplier_id);
  END IF;
END $$;

ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS gold_supplier_years integer;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS trade_assurance boolean DEFAULT false;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS review_score numeric;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS review_count integer;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS response_time_hours numeric;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS on_time_delivery_rate numeric;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS transaction_volume_usd bigint;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS transaction_count integer;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS main_markets text[];
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS export_years integer;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS capabilities text[];
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS category_ranking text;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS source_platform_default text DEFAULT 'alibaba';

-- source_url constraint: allow alibaba.com + 1688.com
ALTER TABLE public.factories DROP CONSTRAINT IF EXISTS factories_source_url_format;
ALTER TABLE public.factories ADD CONSTRAINT factories_source_url_format
  CHECK (
    source_url IS NULL
    OR source_url ~* '^https?://[a-z0-9_.-]+\.alibaba\.com/'
    OR source_url ~* '^https?://[a-z0-9_.-]+\.1688\.com/'
  );
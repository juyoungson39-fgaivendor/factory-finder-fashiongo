ALTER TABLE public.factory_alibaba_products
  ADD COLUMN IF NOT EXISTS material         TEXT,
  ADD COLUMN IF NOT EXISTS gross_weight_kg  NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS category_path    TEXT[],
  ADD COLUMN IF NOT EXISTS attributes       JSONB         NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_enriched_at
  ON public.factory_alibaba_products (enriched_at NULLS FIRST);
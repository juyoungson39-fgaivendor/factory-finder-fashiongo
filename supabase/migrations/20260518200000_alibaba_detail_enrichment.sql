-- ============================================================
-- Detail-page enrichment for Alibaba products.
--
-- The list-page crawl (`crawl-alibaba-products`) only captures
-- title / image / price / MOQ — fields visible on the showroom
-- card. This migration adds the columns the upcoming
-- `enrich-alibaba-product-details` edge function will populate
-- by scraping each product's detail page.
--
-- sourceable_products already has `material`, `weight_kg`,
-- `category` — the enricher mirrors into those.
-- ============================================================

ALTER TABLE public.factory_alibaba_products
  ADD COLUMN IF NOT EXISTS material         TEXT,
  ADD COLUMN IF NOT EXISTS gross_weight_kg  NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS category_path    TEXT[],
  -- Raw attribute table (everything we couldn't model as a column).
  -- Useful as a recovery source if we add more typed columns later.
  ADD COLUMN IF NOT EXISTS attributes       JSONB         NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at      TIMESTAMPTZ;

-- Help the "enrich only what's missing" query path.
CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_enriched_at
  ON public.factory_alibaba_products (enriched_at NULLS FIRST);

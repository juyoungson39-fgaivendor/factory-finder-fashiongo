-- ============================================================
-- Migrate Alibaba-crawled products into sourceable_products,
-- and back up the existing mock data into a `_mock_backup` table.
--
-- Why: the 소싱가능상품 list (rendered from `sourceable_products`)
-- previously held mock seed data. We want the page to show the
-- real Alibaba products crawled by the edge function instead,
-- while preserving the existing CRUD (edit/archive/CSV/match)
-- that all target this table.
-- ============================================================

-- 1) Snapshot existing mock data BEFORE we touch it.
--    `CREATE TABLE AS` copies columns + data but not constraints/indexes
--    — perfect for a backup blob we can restore from if needed.
CREATE TABLE IF NOT EXISTS public.sourceable_products_mock_backup AS
  TABLE public.sourceable_products;

-- The match rows reference sourceable_products(id) ON DELETE CASCADE,
-- so they would be lost when we wipe the originals. Snapshot them too.
CREATE TABLE IF NOT EXISTS public.trend_sourceable_matches_mock_backup AS
  TABLE public.trend_sourceable_matches;

-- 2) Wipe the live mock rows. CASCADE on the FK takes care of matches
--    and any other dependent rows. The WHERE clause is defensive: if
--    this migration is ever re-run, we won't blow away alibaba_crawl
--    rows that arrived after the first run.
DELETE FROM public.sourceable_products
WHERE source IN ('agent_auto', 'csv_upload', 'seed');

-- 3) Allow 'alibaba_crawl' as a valid source.
ALTER TABLE public.sourceable_products
  DROP CONSTRAINT IF EXISTS sourceable_products_source_check;

ALTER TABLE public.sourceable_products
  ADD CONSTRAINT sourceable_products_source_check
  CHECK (source IN ('agent_auto', 'csv_upload', 'seed', 'alibaba_crawl'));

-- 4) Track the originating Alibaba product so re-crawls dedupe
--    against the existing sourceable_products row instead of inserting
--    a duplicate every time.
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS alibaba_product_id TEXT;

-- PostgreSQL treats NULLs as distinct in UNIQUE indexes by default,
-- so non-alibaba rows (alibaba_product_id IS NULL) won't collide.
-- Only (factory_id, alibaba_product_id) tuples with a concrete
-- alibaba_product_id enforce uniqueness.
ALTER TABLE public.sourceable_products
  DROP CONSTRAINT IF EXISTS sourceable_products_factory_alibaba_unique;

ALTER TABLE public.sourceable_products
  ADD CONSTRAINT sourceable_products_factory_alibaba_unique
  UNIQUE (factory_id, alibaba_product_id);

-- 5) Backfill: copy every existing crawled product into sourceable_products.
--    This is the one-shot seed. The edge function (crawl-alibaba-products)
--    will keep both tables in sync on subsequent crawls.
INSERT INTO public.sourceable_products (
  user_id,
  source,
  factory_id,
  item_name,
  vendor_name,
  unit_price,
  unit_price_usd,
  unit_price_cny,
  currency,
  image_url,
  source_url,
  alibaba_product_id,
  status,
  created_at,
  updated_at
)
SELECT
  fap.user_id,
  'alibaba_crawl',
  fap.factory_id,
  fap.title,
  f.name,
  fap.price_min,
  CASE WHEN fap.currency = 'USD' THEN fap.price_min END,
  CASE WHEN fap.currency = 'CNY' THEN fap.price_min END,
  fap.currency,
  fap.main_image_url,
  fap.alibaba_url,
  fap.alibaba_product_id,
  'active',
  fap.scraped_at,
  fap.updated_at
FROM public.factory_alibaba_products fap
LEFT JOIN public.factories f ON f.id = fap.factory_id
ON CONFLICT (factory_id, alibaba_product_id) DO NOTHING;

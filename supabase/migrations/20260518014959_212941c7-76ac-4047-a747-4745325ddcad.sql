-- 20260518000000_alibaba_to_sourceable_products.sql
CREATE TABLE IF NOT EXISTS public.sourceable_products_mock_backup AS
  TABLE public.sourceable_products;

CREATE TABLE IF NOT EXISTS public.trend_sourceable_matches_mock_backup AS
  TABLE public.trend_sourceable_matches;

DELETE FROM public.sourceable_products
WHERE source IN ('agent_auto', 'csv_upload', 'seed');

ALTER TABLE public.sourceable_products
  DROP CONSTRAINT IF EXISTS sourceable_products_source_check;

ALTER TABLE public.sourceable_products
  ADD CONSTRAINT sourceable_products_source_check
  CHECK (source IN ('agent_auto', 'csv_upload', 'seed', 'alibaba_crawl'));

ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS alibaba_product_id TEXT;

ALTER TABLE public.sourceable_products
  DROP CONSTRAINT IF EXISTS sourceable_products_factory_alibaba_unique;

ALTER TABLE public.sourceable_products
  ADD CONSTRAINT sourceable_products_factory_alibaba_unique
  UNIQUE (factory_id, alibaba_product_id);

INSERT INTO public.sourceable_products (
  user_id, source, factory_id, item_name, vendor_name,
  unit_price, unit_price_usd, unit_price_cny, currency,
  image_url, source_url, alibaba_product_id, status, created_at, updated_at
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

-- 20260518100000_alibaba_category_and_moq.sql
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS moq_value INTEGER,
  ADD COLUMN IF NOT EXISTS moq_unit  TEXT;

UPDATE public.sourceable_products sp
SET moq_value = fap.moq_value, moq_unit = fap.moq_unit
FROM public.factory_alibaba_products fap
WHERE sp.source = 'alibaba_crawl'
  AND sp.alibaba_product_id = fap.alibaba_product_id
  AND sp.factory_id = fap.factory_id
  AND (sp.moq_value IS DISTINCT FROM fap.moq_value
    OR sp.moq_unit  IS DISTINCT FROM fap.moq_unit);

UPDATE public.sourceable_products
SET category = CASE
  WHEN item_name ~* '\m(dresses?|gowns?)\M'                                          THEN 'Dress'
  WHEN item_name ~* '\m(two[- ]?piece|two[- ]?pcs?|sets?)\M'                         THEN 'Set'
  WHEN item_name ~* '\m(jumpsuits?|rompers?)\M'                                      THEN 'Jumpsuit'
  WHEN item_name ~* '\m(swimsuits?|bikinis?|swimwear)\M'                             THEN 'Swimwear'
  WHEN item_name ~* '\m(lingerie|underwear|bras?|panty|panties)\M'                   THEN 'Lingerie'
  WHEN item_name ~* '\m(hoodies?|hoody)\M'                                           THEN 'Hoodie'
  WHEN item_name ~* '\m(sweaters?|jumpers?|knits?)\M'                                THEN 'Sweater'
  WHEN item_name ~* '\m(cardigans?)\M'                                               THEN 'Cardigan'
  WHEN item_name ~* '\m(jackets?|blazers?)\M'                                        THEN 'Jacket'
  WHEN item_name ~* '\m(coats?)\M'                                                   THEN 'Coat'
  WHEN item_name ~* '\m(suits?)\M'                                                   THEN 'Suit'
  WHEN item_name ~* '\m(skirts?)\M'                                                  THEN 'Skirt'
  WHEN item_name ~* '\m(pants?|trousers|leggings|jeans|shorts)\M'                    THEN 'Pants'
  WHEN item_name ~* '\m(t[- ]?shirts?|tees?|tops?)\M'                                THEN 'Top'
  WHEN item_name ~* '\m(shirts?|blouses?)\M'                                         THEN 'Shirt'
  ELSE category
END
WHERE source = 'alibaba_crawl' AND category IS NULL AND item_name IS NOT NULL;
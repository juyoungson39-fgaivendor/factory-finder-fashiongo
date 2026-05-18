-- ============================================================
-- Make the 소싱가능상품 filters meaningful for alibaba_crawl rows:
--   1) Backfill `category` via simple title-keyword matching so
--      the existing 카테고리 filter chips populate.
--   2) Add MOQ columns so the new MOQ filter has data to work
--      against, and seed them from factory_alibaba_products.
--
-- Vision-derived fields (detected_colors / detected_style /
-- detected_material / image_description) are intentionally left
-- empty for now — the page already hides those sections when
-- distinct values are empty.
-- ============================================================

-- 1) MOQ columns. INTEGER + TEXT mirror the source table's types.
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS moq_value INTEGER,
  ADD COLUMN IF NOT EXISTS moq_unit  TEXT;

-- 2) Backfill MOQ from factory_alibaba_products for existing
--    alibaba_crawl rows. JOIN on the natural key we already store.
UPDATE public.sourceable_products sp
SET
  moq_value = fap.moq_value,
  moq_unit  = fap.moq_unit
FROM public.factory_alibaba_products fap
WHERE sp.source              = 'alibaba_crawl'
  AND sp.alibaba_product_id  = fap.alibaba_product_id
  AND sp.factory_id          = fap.factory_id
  AND (sp.moq_value IS DISTINCT FROM fap.moq_value
    OR sp.moq_unit  IS DISTINCT FROM fap.moq_unit);

-- 3) Category backfill via title-keyword matching.
--    Order matters in the CASE chain: more specific tokens first
--    (e.g. "two-piece" → Set must beat the generic "set" match
--    elsewhere). `~*` is case-insensitive regex, `\m`/`\M` are
--    word boundaries in PostgreSQL.
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
WHERE source = 'alibaba_crawl'
  AND category IS NULL
  AND item_name IS NOT NULL;

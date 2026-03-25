
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_source_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS search_source_query text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS search_source_image_url text DEFAULT NULL;

COMMENT ON COLUMN public.products.search_source_type IS 'How this product was targeted: image, text, trend';
COMMENT ON COLUMN public.products.search_source_query IS 'The text query or trend prompt used to find this product';
COMMENT ON COLUMN public.products.search_source_image_url IS 'The image URL used to find this product (if image search)';

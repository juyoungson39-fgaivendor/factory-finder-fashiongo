ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS product_no text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS color_size text,
  ADD COLUMN IF NOT EXISTS purchase_link text;
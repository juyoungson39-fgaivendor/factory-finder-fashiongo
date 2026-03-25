
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_factory_id uuid REFERENCES public.factories(id),
  ADD COLUMN IF NOT EXISTS source_factory_name text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_product_url text,
  ADD COLUMN IF NOT EXISTS source_product_name text,
  ADD COLUMN IF NOT EXISTS source_price numeric,
  ADD COLUMN IF NOT EXISTS source_price_currency text DEFAULT 'CNY',
  ADD COLUMN IF NOT EXISTS source_images text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_crawled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS source_raw_data jsonb DEFAULT '{}';

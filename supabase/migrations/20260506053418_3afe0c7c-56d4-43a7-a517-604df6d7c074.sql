ALTER TABLE public.sourceable_products ADD COLUMN IF NOT EXISTS image_url_mirror text;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS image_url_mirror text;
CREATE INDEX IF NOT EXISTS idx_sp_mirror_pending ON public.sourceable_products (id) WHERE image_embedding IS NULL AND image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ta_mirror_pending ON public.trend_analyses (id) WHERE image_embedding IS NULL;
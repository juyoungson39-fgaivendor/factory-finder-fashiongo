-- Backup the 40 mock rows
CREATE TABLE IF NOT EXISTS public.sourceable_products_archived_20260506 AS
SELECT * FROM public.sourceable_products
 WHERE image_url_storage IS NULL
   AND image_embedding IS NULL;

-- Add archive metadata columns
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_reason text;
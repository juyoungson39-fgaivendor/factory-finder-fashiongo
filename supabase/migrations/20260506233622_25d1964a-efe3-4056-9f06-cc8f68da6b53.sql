-- Drop existing CHECK and add new one without 'manual'
ALTER TABLE public.sourceable_products DROP CONSTRAINT IF EXISTS sourceable_products_source_check;
ALTER TABLE public.sourceable_products ADD CONSTRAINT sourceable_products_source_check CHECK (source IN ('agent_auto', 'csv_upload', 'seed'));
ALTER TABLE public.sourceable_products ALTER COLUMN source SET DEFAULT 'csv_upload';
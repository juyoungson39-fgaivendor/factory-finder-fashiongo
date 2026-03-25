ALTER TABLE public.sourceable_products ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CNY';
ALTER TABLE public.products ALTER COLUMN user_id DROP NOT NULL;
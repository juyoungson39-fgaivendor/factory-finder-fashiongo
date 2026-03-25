ALTER TABLE public.sourceable_products 
  ADD COLUMN IF NOT EXISTS is_uploaded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS size_chart text;
ALTER TABLE public.sourceable_products ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.sourceable_products ALTER COLUMN item_name DROP NOT NULL;
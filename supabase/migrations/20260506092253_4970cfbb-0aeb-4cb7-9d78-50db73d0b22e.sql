ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS sub_category_count integer;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS has_new_arrivals_tab boolean;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS has_promotion_tab boolean;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS production_tab_count integer;
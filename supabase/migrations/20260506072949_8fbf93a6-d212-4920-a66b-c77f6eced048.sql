ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS product_review_count integer;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS star_distribution jsonb;

-- Add 1688 platform score columns to factories table
ALTER TABLE public.factories 
ADD COLUMN IF NOT EXISTS platform_score numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS platform_score_detail jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fg_category text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recommendation_grade text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS repurchase_rate numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS years_on_platform integer DEFAULT NULL;

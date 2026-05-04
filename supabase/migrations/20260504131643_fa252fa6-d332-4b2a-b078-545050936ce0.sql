ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS name_en text;
CREATE INDEX IF NOT EXISTS idx_factories_name_en ON public.factories(name_en) WHERE name_en IS NOT NULL;
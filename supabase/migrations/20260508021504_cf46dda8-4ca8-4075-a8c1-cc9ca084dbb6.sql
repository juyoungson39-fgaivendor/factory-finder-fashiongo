ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS supplier_index text;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS response_rate numeric;
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS year_established integer;
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS description_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS description_generated_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sourceable_products_description_source_check') THEN
    ALTER TABLE public.sourceable_products
      ADD CONSTRAINT sourceable_products_description_source_check
      CHECK (description_source IN ('manual','ai'));
  END IF;
END $$;
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS fg_collab_status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS fg_collab_code text,
  ADD COLUMN IF NOT EXISTS fg_collab_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'factories_fg_collab_status_check'
  ) THEN
    ALTER TABLE public.factories
      ADD CONSTRAINT factories_fg_collab_status_check
      CHECK (fg_collab_status IN ('new','active','fg_listed','stopped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_factories_fg_collab_status ON public.factories(fg_collab_status);
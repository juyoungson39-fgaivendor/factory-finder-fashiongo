CREATE TABLE IF NOT EXISTS public.fg_conversion_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE
    REFERENCES public.trend_sourceable_matches(id) ON DELETE CASCADE,
  item_name   text,
  style_no    text,
  category    text,
  unit_price  numeric,
  msrp        numeric,
  color_size  text,
  material    text,
  weight_kg   numeric,
  made_in     text DEFAULT 'China',
  pack        text DEFAULT 'Open-pack',
  min_qty     integer DEFAULT 6,
  description text,
  fg_status   text DEFAULT 'Active',
  converted_image_url text,
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','confirmed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fg_conversion_drafts TO authenticated;
GRANT ALL ON public.fg_conversion_drafts TO service_role;

CREATE INDEX IF NOT EXISTS idx_fcd_match  ON public.fg_conversion_drafts(match_id);
CREATE INDEX IF NOT EXISTS idx_fcd_status ON public.fg_conversion_drafts(status);

ALTER TABLE public.fg_conversion_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcd_select_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_select_authenticated"
  ON public.fg_conversion_drafts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fcd_insert_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_insert_authenticated"
  ON public.fg_conversion_drafts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fcd_update_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_update_authenticated"
  ON public.fg_conversion_drafts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fcd_delete_authenticated" ON public.fg_conversion_drafts;
CREATE POLICY "fcd_delete_authenticated"
  ON public.fg_conversion_drafts FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.touch_fcd_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fcd_touch ON public.fg_conversion_drafts;
CREATE TRIGGER trg_fcd_touch
  BEFORE UPDATE ON public.fg_conversion_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_fcd_updated_at();

NOTIFY pgrst, 'reload schema';
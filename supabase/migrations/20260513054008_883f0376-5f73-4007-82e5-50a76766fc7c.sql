CREATE TABLE public.trend_match_vendor_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.trend_sourceable_matches(id) ON DELETE CASCADE,
  vendor_id text NOT NULL,
  vendor_name text,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  allocated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  CONSTRAINT trend_match_vendor_allocations_match_vendor_unique UNIQUE (match_id, vendor_id)
);

CREATE INDEX idx_tmva_match_id ON public.trend_match_vendor_allocations(match_id);
CREATE INDEX idx_tmva_vendor_id ON public.trend_match_vendor_allocations(vendor_id);

ALTER TABLE public.trend_match_vendor_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view allocations"
  ON public.trend_match_vendor_allocations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert allocations"
  ON public.trend_match_vendor_allocations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete allocations"
  ON public.trend_match_vendor_allocations
  FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
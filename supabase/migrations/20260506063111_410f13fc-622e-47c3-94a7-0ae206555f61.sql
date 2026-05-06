ALTER TABLE public.sourceable_products_archived_20260506 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read archived snapshot"
  ON public.sourceable_products_archived_20260506
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
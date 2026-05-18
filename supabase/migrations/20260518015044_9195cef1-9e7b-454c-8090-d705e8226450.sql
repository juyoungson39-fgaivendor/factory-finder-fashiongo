ALTER TABLE public.sourceable_products_mock_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_sourceable_matches_mock_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read sourceable mock backup"
  ON public.sourceable_products_mock_backup
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can read matches mock backup"
  ON public.trend_sourceable_matches_mock_backup
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
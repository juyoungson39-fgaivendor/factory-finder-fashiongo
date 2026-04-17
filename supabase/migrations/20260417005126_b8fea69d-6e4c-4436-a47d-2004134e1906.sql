DROP POLICY IF EXISTS "Service role can manage" ON public.sourcing_reports;

CREATE POLICY "Service role can manage"
  ON public.sourcing_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
-- Allow authenticated users to update match status
-- (Previously only service_role could write; authenticated users had SELECT only)

CREATE POLICY "Authenticated update tsm status"
  ON public.trend_sourceable_matches
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (status IN ('pending_confirm', 'approved', 'rejected', 'active'));

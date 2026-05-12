CREATE POLICY "matches_update_status_authenticated"
ON public.trend_sourceable_matches
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
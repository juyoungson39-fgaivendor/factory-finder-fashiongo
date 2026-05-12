-- Allow only admin users to update match status
-- Replaces the broad "all authenticated" policy with admin-only access.

-- Drop previous version if it exists (idempotent)
DROP POLICY IF EXISTS "Authenticated update tsm status" ON public.trend_sourceable_matches;
DROP POLICY IF EXISTS "Admin update tsm status"         ON public.trend_sourceable_matches;

CREATE POLICY "Admin update tsm status"
  ON public.trend_sourceable_matches
  FOR UPDATE
  TO authenticated
  USING     (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

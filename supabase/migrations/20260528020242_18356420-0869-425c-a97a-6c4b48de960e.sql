
-- 1. Restrict AI provider config tables to admins only (remove broad read)
DROP POLICY IF EXISTS "Authenticated can read bindings" ON public.ai_capability_bindings;
DROP POLICY IF EXISTS "Authenticated can read providers" ON public.ai_providers;

CREATE POLICY "Admins can read bindings"
  ON public.ai_capability_bindings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can read providers"
  ON public.ai_providers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. collection_settings: tighten to authenticated role only
DROP POLICY IF EXISTS "Anyone can read collection_settings" ON public.collection_settings;
DROP POLICY IF EXISTS "Authenticated users can insert collection_settings" ON public.collection_settings;
DROP POLICY IF EXISTS "Authenticated users can update collection_settings" ON public.collection_settings;

CREATE POLICY "Authenticated can read collection_settings"
  ON public.collection_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert collection_settings"
  ON public.collection_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update collection_settings"
  ON public.collection_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.collection_settings FROM anon;

-- 3. Lock down legacy backup tables containing sensitive contact info
REVOKE ALL ON public.factories_backup_20260511 FROM anon, authenticated;
REVOKE ALL ON public.factories_backup_alibaba_pivot FROM anon, authenticated;
REVOKE ALL ON public.factories_backup_v3 FROM anon, authenticated;

CREATE POLICY "Admins only - backup 20260511"
  ON public.factories_backup_20260511 FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins only - backup pivot"
  ON public.factories_backup_alibaba_pivot FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins only - backup v3"
  ON public.factories_backup_v3 FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

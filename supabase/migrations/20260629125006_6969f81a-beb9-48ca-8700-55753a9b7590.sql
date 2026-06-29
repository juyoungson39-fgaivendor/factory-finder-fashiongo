
DROP POLICY IF EXISTS "Users can manage own factory tags" ON public.factory_tags;

CREATE POLICY "Authenticated can read factory_tags"
  ON public.factory_tags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert factory_tags"
  ON public.factory_tags FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update factory_tags"
  ON public.factory_tags FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete factory_tags"
  ON public.factory_tags FOR DELETE TO authenticated
  USING (true);

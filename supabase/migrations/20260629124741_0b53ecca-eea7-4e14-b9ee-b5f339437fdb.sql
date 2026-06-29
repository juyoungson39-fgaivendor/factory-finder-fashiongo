
-- fg_buyer_signals: drop duplicate public-role SELECT
DROP POLICY IF EXISTS "Users can view own signals" ON public.fg_buyer_signals;

-- fg_registered_products: drop all public-role policies; recreate as authenticated
DROP POLICY IF EXISTS "Anyone can view seed registered products" ON public.fg_registered_products;
DROP POLICY IF EXISTS "Users can insert their own registered products" ON public.fg_registered_products;
DROP POLICY IF EXISTS "Users can update their own registered products" ON public.fg_registered_products;
DROP POLICY IF EXISTS "Users can view their own registered products" ON public.fg_registered_products;

CREATE POLICY "Users can view their own registered products"
  ON public.fg_registered_products FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own registered products"
  ON public.fg_registered_products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own registered products"
  ON public.fg_registered_products FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- fg_settings: re-scope to authenticated
DROP POLICY IF EXISTS "Users can view their own settings" ON public.fg_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.fg_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.fg_settings;

CREATE POLICY "Users can view their own settings"
  ON public.fg_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings"
  ON public.fg_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings"
  ON public.fg_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- collection_settings: add DELETE policy for authenticated (shared collaborative model)
CREATE POLICY "Authenticated can delete collection_settings"
  ON public.collection_settings FOR DELETE TO authenticated
  USING (true);

-- factory_scores: align with shared factories read model — readable by all authenticated
DROP POLICY IF EXISTS "Users can select scores for own factories" ON public.factory_scores;
CREATE POLICY "Authenticated can read factory_scores"
  ON public.factory_scores FOR SELECT TO authenticated
  USING (true);

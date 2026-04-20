
-- 1. factories: restrict SELECT to own rows (protects PII)
DROP POLICY IF EXISTS "Authenticated users can view all factories" ON public.factories;
CREATE POLICY "Users can view own factories"
ON public.factories FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 2. batch_runs: remove public-role full access, restrict to service_role only
DROP POLICY IF EXISTS "Allow service role full access" ON public.batch_runs;
CREATE POLICY "Service role manages batch runs"
ON public.batch_runs FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 3. sourceable_products: remove public read; require auth
DROP POLICY IF EXISTS "Allow public read sourceable products" ON public.sourceable_products;
CREATE POLICY "Authenticated users can read sourceable products"
ON public.sourceable_products FOR SELECT TO authenticated
USING (true);

-- 4. ai_model_versions: restrict read to admins only
DROP POLICY IF EXISTS "Allow public read model versions" ON public.ai_model_versions;
DROP POLICY IF EXISTS "Anyone authenticated can read model versions" ON public.ai_model_versions;
CREATE POLICY "Admins can read model versions"
ON public.ai_model_versions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5. ai_training_jobs: restrict read to admins only (was: all authenticated)
DROP POLICY IF EXISTS "Authenticated users can view all training jobs" ON public.ai_training_jobs;
CREATE POLICY "Admins can read training jobs"
ON public.ai_training_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 6. Recreate fg_signal_category_stats as SECURITY INVOKER view
DROP VIEW IF EXISTS public.fg_signal_category_stats;
CREATE VIEW public.fg_signal_category_stats
WITH (security_invoker = true) AS
SELECT user_id,
  product_category,
  sum(CASE WHEN (signal_type = 'view'::text) THEN count ELSE 0 END) AS view_count,
  sum(CASE WHEN (signal_type = 'click'::text) THEN count ELSE 0 END) AS click_count,
  sum(CASE WHEN (signal_type = 'wishlist'::text) THEN count ELSE 0 END) AS wishlist_count,
  sum(CASE WHEN (signal_type = 'order'::text) THEN count ELSE 0 END) AS order_count,
  sum(CASE WHEN (signal_type = 'search'::text) THEN count ELSE 0 END) AS search_count,
  sum(count) AS total_signals,
  max(signal_date) AS last_signal_date
FROM public.fg_buyer_signals
WHERE (signal_date >= (CURRENT_DATE - '7 days'::interval))
GROUP BY user_id, product_category;

-- 7. Storage: ai-generated-images DELETE — require ownership via folder prefix
DROP POLICY IF EXISTS "Authenticated users can manage ai images" ON storage.objects;
CREATE POLICY "Users can delete own ai images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ai-generated-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 8. Stop publishing ai_training_jobs to Realtime (training data leak risk)
ALTER PUBLICATION supabase_realtime DROP TABLE public.ai_training_jobs;

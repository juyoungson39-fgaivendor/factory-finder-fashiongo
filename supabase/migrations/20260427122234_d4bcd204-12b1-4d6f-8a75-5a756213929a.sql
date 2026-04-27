DROP VIEW IF EXISTS public.v_crawl_progress;

CREATE VIEW public.v_crawl_progress
WITH (security_invoker = on) AS
SELECT 
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE shop_id IS NULL OR shop_id = '') AS null_shop_id,
  COUNT(*) FILTER (WHERE score_status = 'ai_scored') AS scored,
  COUNT(*) FILTER (WHERE score_status = 'new' AND shop_id IS NOT NULL AND shop_id <> '') AS pending,
  COUNT(*) FILTER (WHERE score_status = 'error') AS errors,
  ROUND(100.0 * COUNT(*) FILTER (WHERE score_status = 'ai_scored') / NULLIF(COUNT(*), 0), 1) AS pct_done
FROM public.factories
WHERE deleted_at IS NULL;

GRANT SELECT ON public.v_crawl_progress TO authenticated;
GRANT SELECT ON public.v_crawl_progress TO service_role;
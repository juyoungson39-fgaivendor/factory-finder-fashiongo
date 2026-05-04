-- Direct cascade delete for factories with NULL shop_id
DELETE FROM public.factory_scores      WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.scoring_corrections WHERE vendor_id         IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.sourceable_products WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.factory_notes       WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.factory_photos      WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.factory_tags        WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.fashiongo_queue     WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.trend_matches       WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.products            WHERE source_factory_id IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
DELETE FROM public.product_logs        WHERE factory_id        IN (SELECT id FROM public.factories WHERE shop_id IS NULL);
UPDATE public.manual_crawl_queue SET resolved_factory_id = NULL
  WHERE resolved_factory_id IN (SELECT id FROM public.factories WHERE shop_id IS NULL);

DELETE FROM public.factories WHERE shop_id IS NULL;

-- Re-enqueue 8 shop URLs (now that factories is clean)
INSERT INTO public.manual_crawl_queue (url, status)
SELECT source_url, 'pending' FROM public.factories
WHERE shop_id NOT LIKE 'PENDING_%'
  AND source_url IS NOT NULL
  AND source_url NOT IN (SELECT url FROM public.manual_crawl_queue);
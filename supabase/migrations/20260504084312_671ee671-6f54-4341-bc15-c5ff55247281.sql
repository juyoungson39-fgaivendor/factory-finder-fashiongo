-- [2] Backup
DROP TABLE IF EXISTS public.factories_backup_v3;
CREATE TABLE public.factories_backup_v3 AS SELECT * FROM public.factories;

-- [3] Identify factories to delete (not in keep-list, or NULL/empty shop_id)
-- Keep list: 10 vendors with valid fg_collab_code
WITH to_delete AS (
  SELECT id FROM public.factories
  WHERE shop_id IS NULL
     OR shop_id = ''
     OR shop_id NOT IN (
       'shop1423500310394','1618fs','PENDING_0012','shop7729487h00e63','PENDING_0006',
       'aosizhefashion','heimeiren','weiluosifuzhuang','shanrong0769','shop196946621s8f0'
     )
)
-- Cascade delete from all child tables
, d1 AS (DELETE FROM public.factory_scores         WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d2 AS (DELETE FROM public.scoring_corrections    WHERE vendor_id           IN (SELECT id FROM to_delete) RETURNING 1)
, d3 AS (DELETE FROM public.sourceable_products    WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d4 AS (DELETE FROM public.factory_notes          WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d5 AS (DELETE FROM public.factory_photos         WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d6 AS (DELETE FROM public.factory_tags           WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d7 AS (DELETE FROM public.fashiongo_queue        WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d8 AS (DELETE FROM public.trend_matches          WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d9 AS (DELETE FROM public.products               WHERE source_factory_id   IN (SELECT id FROM to_delete) RETURNING 1)
, d10 AS (DELETE FROM public.product_logs          WHERE factory_id          IN (SELECT id FROM to_delete) RETURNING 1)
, d11 AS (UPDATE public.manual_crawl_queue SET resolved_factory_id = NULL
          WHERE resolved_factory_id IN (SELECT id FROM to_delete) RETURNING 1)
-- [4] Delete factories
DELETE FROM public.factories WHERE id IN (SELECT id FROM to_delete);

-- [7] Enqueue 8 shop URLs (PENDING_* are detail URLs — handled separately)
INSERT INTO public.manual_crawl_queue (url, status)
SELECT source_url, 'pending' FROM public.factories
WHERE shop_id NOT LIKE 'PENDING_%'
  AND source_url IS NOT NULL
  AND source_url NOT IN (SELECT url FROM public.manual_crawl_queue);
-- Stage A-1: Backup 1688 factories and related sourceable_products before purge
CREATE TABLE IF NOT EXISTS public.factories_1688_backup_20260511 AS
  SELECT * FROM public.factories
  WHERE source_platform = '1688'
     OR source_platform IS NULL
     OR shop_id LIKE 'shop%'
     OR shop_id LIKE 'PENDING_%'
     OR shop_id LIKE 'migrated-%';

CREATE TABLE IF NOT EXISTS public.sourceable_products_1688_backup_20260511 AS
  SELECT sp.*
  FROM public.sourceable_products sp
  LEFT JOIN public.factories f ON sp.factory_id = f.id
  WHERE f.source_platform = '1688'
     OR f.source_platform IS NULL
     OR sp.purchase_link LIKE '%1688%'
     OR sp.source_url LIKE '%1688%'
     OR sp.product_no LIKE 'JINGRU%'
     OR sp.product_no LIKE 'PG%'
     OR sp.product_no LIKE 'KAG%'
     OR sp.product_no LIKE 'CAT%';
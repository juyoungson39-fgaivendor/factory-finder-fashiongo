-- Drop legacy products table + product_logs (option 3-D full decommission)
-- Background:
--   public.products      = isolated legacy, last data INSERT 2026-03-25 (seed only), 18 rows backed up to /mnt/documents/products_backup_20260508.json
--   public.product_logs  = dead leaf, 0 rows, 0 reads/writes, no external FK refs
-- Removed UI: SourcingTargetFG.tsx (Phase 1)
-- Removed Edge Function: search-product-images (Phase 2)
-- Removed component shells: ProductLogTimeline.tsx, productLogHelpers.ts, ProductConfirmCard.productLogs prop
-- Order: product_logs first (it FK-references products), then products.
DROP TABLE IF EXISTS public.product_logs;
DROP TABLE IF EXISTS public.products;
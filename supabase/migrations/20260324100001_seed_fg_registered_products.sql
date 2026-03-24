-- Seed: Backfill 3 products previously registered to FashionGo via VA API
-- These products were registered manually before fg_registered_products table existed.
-- Source: NAME_MAP in FGRegistrationSheet.tsx + AIVendorDetail VENDOR_PRODUCTS mock data
-- wholesaler_id: 6676 (&merci DEV test account — all AI vendors share this ID for now)
--
-- NOTE: fg_product_id values below are placeholders.
--       Update with actual IDs from VA API product list (wholesalerId=6676, active=true).

INSERT INTO public.fg_registered_products
  (fg_product_id, wholesaler_id, vendor_key, style_no, item_name, unit_price, status, registered_at, created_at, updated_at)
VALUES
  -- 1. Linen Wide Leg Slacks (린넨 와이드 슬랙스) — BASIC vendor
  --    yuan: ~158 => unitPrice ≈ 22.57 USD (158 / 7)
  (0, 6676, 'basic', 'FG-BASIC-202603-1001', 'Linen Wide Leg Slacks', 22.57, 'registered', '2026-03-23 00:00:00+00', now(), now()),

  -- 2. Wide Denim Pants (와이드 데님 팬츠) — DENIM vendor
  --    yuan: ~154 => unitPrice ≈ 22.00 USD (154 / 7)
  (0, 6676, 'denim', 'FG-DENIM-202603-1001', 'Wide Denim Pants', 22.00, 'registered', '2026-03-23 00:00:00+00', now(), now()),

  -- 3. Striped Shirt Dress (스트라이프 셔츠 원피스) — VACATION vendor
  --    yuan: ~168 => unitPrice ≈ 24.00 USD (168 / 7)
  (0, 6676, 'vacation', 'FG-VACATION-202603-1001', 'Striped Shirt Dress', 24.00, 'registered', '2026-03-23 00:00:00+00', now(), now());

-- TODO: Replace fg_product_id=0 with actual FG product IDs.
--       To find them: call VA API GET /products?wholesalerId=6676&active=true
--       and match by itemName.

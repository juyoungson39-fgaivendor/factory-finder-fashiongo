-- Seed: Backfill 3 products registered to FashionGo via VA API (2026-03-23)
-- wholesaler_id: 6676 (&merci DEV test account — all AI vendors share this ID for now)
-- Product IDs confirmed from VA API: GET /products?wholesalerId=6676&active=true

INSERT INTO public.fg_registered_products
  (fg_product_id, wholesaler_id, vendor_key, style_no, item_name, unit_price, status, activated_at, registered_at, created_at, updated_at)
VALUES
  -- 1. Linen Blend Wrap Dress — BASIC vendor
  (14226646, 6676, 'basic', 'MER-LINEN-WRAP', 'Linen Blend Wrap Dress', 32.00, 'activated', '2026-03-24 03:21:37+00', '2026-03-23 21:08:32+00', now(), now()),

  -- 2. Smocked Halter Maxi Dress — DENIM vendor
  (14226645, 6676, 'denim', 'MER-SMOCKED-HALTER', 'Smocked Halter Maxi Dress', 34.00, 'activated', '2026-03-24 03:21:34+00', '2026-03-23 21:08:30+00', now(), now()),

  -- 3. Floral Ruffle Midi Dress — VACATION vendor
  (14226644, 6676, 'vacation', 'MER-FLORAL-RUFFLE', 'Floral Ruffle Midi Dress', 28.00, 'activated', '2026-03-24 03:21:32+00', '2026-03-23 21:08:30+00', now(), now());

-- Allow all authenticated users to view seed data (user_id is NULL for backfilled records)
CREATE POLICY "Anyone can view seed registered products"
    ON public.fg_registered_products FOR SELECT
    USING (user_id IS NULL);

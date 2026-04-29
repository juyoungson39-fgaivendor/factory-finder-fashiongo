-- Add unique constraint to fg_buyer_signals so upsert ON CONFLICT works.
-- First deduplicate any existing duplicate rows (keep the earliest by created_at).
DELETE FROM public.fg_buyer_signals a
USING public.fg_buyer_signals b
WHERE a.ctid > b.ctid
  AND a.user_id = b.user_id
  AND a.signal_type = b.signal_type
  AND COALESCE(a.product_category, '') = COALESCE(b.product_category, '')
  AND COALESCE(a.keyword, '') = COALESCE(b.keyword, '')
  AND a.signal_date = b.signal_date;

-- Add the unique constraint matching the edge function's onConflict spec.
ALTER TABLE public.fg_buyer_signals
  ADD CONSTRAINT fg_buyer_signals_unique_signal
  UNIQUE (user_id, signal_type, product_category, keyword, signal_date);
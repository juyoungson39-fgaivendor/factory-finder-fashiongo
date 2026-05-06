ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS raw_main_category text,
  ADD COLUMN IF NOT EXISTS raw_employee_count integer,
  ADD COLUMN IF NOT EXISTS raw_paid_orders_30d integer,
  ADD COLUMN IF NOT EXISTS raw_response_3min_rate numeric,
  ADD COLUMN IF NOT EXISTS raw_dispute_rate numeric,
  ADD COLUMN IF NOT EXISTS raw_business_model text,
  ADD COLUMN IF NOT EXISTS contact_full jsonb,
  ADD COLUMN IF NOT EXISTS platform_ai_summary text;
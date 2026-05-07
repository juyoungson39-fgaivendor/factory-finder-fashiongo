
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS unit_price_cny numeric,
  ADD COLUMN IF NOT EXISTS exchange_rate_at_import numeric;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  cny_to_usd_rate numeric NOT NULL,
  rate_updated_at timestamptz NOT NULL DEFAULT now(),
  rate_updated_by uuid REFERENCES auth.users(id),
  rate_source text DEFAULT 'manual',
  CONSTRAINT only_one_row CHECK (id = 1)
);

INSERT INTO public.system_settings (id, cny_to_usd_rate, rate_source)
VALUES (1, 0.137, 'manual')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings_select_authenticated"
  ON public.system_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "system_settings_update_admin"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "system_settings_insert_admin"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

UPDATE public.sourceable_products
   SET unit_price_cny = ROUND(unit_price_usd / 0.137, 2)
 WHERE unit_price_usd IS NOT NULL
   AND unit_price_cny IS NULL;

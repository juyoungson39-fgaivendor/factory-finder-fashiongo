UPDATE public.factory_alibaba_products
   SET enriched_at = NULL,
       material = NULL,
       gross_weight_kg = NULL,
       category_path = NULL,
       attributes = '{}'::jsonb
 WHERE enriched_at IS NOT NULL;
-- 1. Change product_id from integer to text for UUID support
DROP INDEX IF EXISTS idx_converted_product_images_unique;
ALTER TABLE public.converted_product_images ALTER COLUMN product_id TYPE text USING product_id::text;
CREATE UNIQUE INDEX idx_converted_product_images_unique ON public.converted_product_images (user_id, product_id, vendor_key);

-- 2. Create vendor_model_settings table for persistent model config
CREATE TABLE IF NOT EXISTS public.vendor_model_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vendor_id text NOT NULL,
  gender text NOT NULL DEFAULT '여성',
  ethnicity text NOT NULL DEFAULT 'Asian',
  body_type text NOT NULL DEFAULT 'Regular',
  pose text NOT NULL DEFAULT 'Standing Front',
  model_image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, vendor_id)
);

ALTER TABLE public.vendor_model_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own model settings"
  ON public.vendor_model_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
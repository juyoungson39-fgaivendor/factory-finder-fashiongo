
CREATE TABLE public.converted_product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id integer NOT NULL,
  product_name text NOT NULL,
  vendor_key text NOT NULL,
  original_image_url text,
  converted_image_url text NOT NULL,
  feedback text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.converted_product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own converted images"
  ON public.converted_product_images
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_converted_product_images_unique 
  ON public.converted_product_images (user_id, product_id, vendor_key);

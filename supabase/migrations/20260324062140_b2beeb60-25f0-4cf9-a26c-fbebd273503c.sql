
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text,
  name text NOT NULL,
  price numeric,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own products" ON public.products
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products" ON public.products
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own products" ON public.products
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

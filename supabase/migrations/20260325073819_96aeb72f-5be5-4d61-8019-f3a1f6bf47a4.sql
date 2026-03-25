-- Allow authenticated users to delete their own products
CREATE POLICY "Users can delete all products" ON public.products FOR DELETE TO authenticated USING (true);

-- Allow authenticated users to update all products (currently only own)
DROP POLICY IF EXISTS "Users can update own products" ON public.products;
CREATE POLICY "Users can update all products" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow public read for products (for preview)
CREATE POLICY "Allow public read products" ON public.products FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Users can view own products" ON public.products;

-- Allow authenticated users to delete sourceable_products
CREATE POLICY "Users can delete sourceable products" ON public.sourceable_products FOR DELETE TO authenticated USING (true);

-- Allow authenticated users to update all sourceable_products
DROP POLICY IF EXISTS "Users can manage own sourceable products" ON public.sourceable_products;
CREATE POLICY "Users can insert sourceable products" ON public.sourceable_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update sourceable products" ON public.sourceable_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
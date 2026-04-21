-- Fix: 'products' table publicly exposed user data
DROP POLICY IF EXISTS "Allow public read products" ON public.products;

CREATE POLICY "Users can view own products"
ON public.products
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

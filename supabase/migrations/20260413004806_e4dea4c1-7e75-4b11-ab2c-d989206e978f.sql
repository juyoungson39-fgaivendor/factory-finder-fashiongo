
-- 1. Fix factory_scores: scope writes to factory owner
DROP POLICY IF EXISTS "Authenticated users can insert factory scores" ON public.factory_scores;
DROP POLICY IF EXISTS "Authenticated users can update factory scores" ON public.factory_scores;

CREATE POLICY "Users can insert scores for own factories"
ON public.factory_scores
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.factories
    WHERE factories.id = factory_scores.factory_id
    AND factories.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update scores for own factories"
ON public.factory_scores
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.factories
    WHERE factories.id = factory_scores.factory_id
    AND factories.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.factories
    WHERE factories.id = factory_scores.factory_id
    AND factories.user_id = auth.uid()
  )
);

-- 2. Fix sourceable_products: scope writes to owner
DROP POLICY IF EXISTS "Users can insert sourceable products" ON public.sourceable_products;
DROP POLICY IF EXISTS "Users can update sourceable products" ON public.sourceable_products;
DROP POLICY IF EXISTS "Users can delete sourceable products" ON public.sourceable_products;

CREATE POLICY "Users can insert own sourceable products"
ON public.sourceable_products
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sourceable products"
ON public.sourceable_products
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sourceable products"
ON public.sourceable_products
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 3. Fix products: remove overly permissive policies
DROP POLICY IF EXISTS "Users can delete all products" ON public.products;
DROP POLICY IF EXISTS "Users can update all products" ON public.products;

CREATE POLICY "Users can update own products"
ON public.products
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

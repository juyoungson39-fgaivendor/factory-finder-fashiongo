
DROP POLICY "Users can view own factories" ON public.factories;

CREATE POLICY "Authenticated users can view all factories"
ON public.factories
FOR SELECT
TO authenticated
USING (true);

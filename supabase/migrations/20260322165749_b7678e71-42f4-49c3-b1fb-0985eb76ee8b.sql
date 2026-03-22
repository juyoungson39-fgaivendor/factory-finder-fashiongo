
DROP POLICY "Users can manage own factory scores" ON public.factory_scores;

CREATE POLICY "Authenticated users can select factory scores"
ON public.factory_scores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert factory scores"
ON public.factory_scores FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update factory scores"
ON public.factory_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

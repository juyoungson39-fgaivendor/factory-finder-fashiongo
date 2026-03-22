CREATE POLICY "Authenticated users can view all training jobs"
ON public.ai_training_jobs
FOR SELECT
TO authenticated
USING (true);
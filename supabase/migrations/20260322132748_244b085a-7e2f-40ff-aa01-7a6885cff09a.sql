
-- Add columns to factories for score confirmation and soft delete
ALTER TABLE public.factories 
  ADD COLUMN IF NOT EXISTS score_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

-- Add columns to factory_scores for AI original score tracking
ALTER TABLE public.factory_scores
  ADD COLUMN IF NOT EXISTS ai_original_score numeric,
  ADD COLUMN IF NOT EXISTS correction_reason text;

-- Create ai_training_jobs table for fine-tuning job tracking
CREATE TABLE IF NOT EXISTS public.ai_training_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  model_type text NOT NULL DEFAULT 'scoring',
  status text NOT NULL DEFAULT 'pending',
  vertex_job_name text,
  training_data_count integer NOT NULL DEFAULT 0,
  training_file_uri text,
  result_endpoint text,
  progress_pct integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_training_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage training jobs"
  ON public.ai_training_jobs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

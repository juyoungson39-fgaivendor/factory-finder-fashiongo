CREATE TABLE IF NOT EXISTS public.batch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  collected_count INTEGER DEFAULT 0,
  analyzed_count INTEGER DEFAULT 0,
  embedded_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  error_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.batch_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access" ON public.batch_runs FOR ALL USING (true);
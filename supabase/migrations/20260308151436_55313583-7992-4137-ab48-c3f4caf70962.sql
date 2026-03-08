
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a table to store scheduling preferences per user
CREATE TABLE public.trend_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  cron_expression text NOT NULL DEFAULT '0 9 * * 1',
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  extra_categories text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own schedule"
  ON public.trend_schedules FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_trend_schedules_updated_at
  BEFORE UPDATE ON public.trend_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

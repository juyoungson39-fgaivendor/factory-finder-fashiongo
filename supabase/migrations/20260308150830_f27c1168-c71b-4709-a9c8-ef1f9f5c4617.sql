
CREATE TABLE public.trend_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trend_keywords text[] NOT NULL DEFAULT '{}',
  trend_categories text[] DEFAULT '{}',
  source_data jsonb DEFAULT '{}',
  status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trend analyses"
  ON public.trend_analyses FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.trend_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_analysis_id uuid NOT NULL REFERENCES public.trend_analyses(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  matched_keywords text[] DEFAULT '{}',
  match_score numeric DEFAULT 0,
  ai_reasoning text,
  status text DEFAULT 'suggested',
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trend matches"
  ON public.trend_matches FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_trend_analyses_updated_at
  BEFORE UPDATE ON public.trend_analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

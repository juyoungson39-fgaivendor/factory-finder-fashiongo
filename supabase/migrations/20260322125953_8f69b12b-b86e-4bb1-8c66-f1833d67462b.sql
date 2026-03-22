
-- scoring_corrections table
CREATE TABLE public.scoring_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES public.factories(id) ON DELETE CASCADE NOT NULL,
  criteria_key TEXT NOT NULL,
  ai_score INTEGER NOT NULL CHECK (ai_score >= 0 AND ai_score <= 10),
  corrected_score INTEGER NOT NULL CHECK (corrected_score >= 0 AND corrected_score <= 10),
  reason TEXT NOT NULL,
  diff INTEGER GENERATED ALWAYS AS (corrected_score - ai_score) STORED,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  collected_by UUID NOT NULL,
  used_in_version TEXT
);

ALTER TABLE public.scoring_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scoring corrections"
ON public.scoring_corrections
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ai_model_versions table
CREATE TABLE public.ai_model_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'TRAINING', 'FAILED')),
  base_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  vertex_job_id TEXT,
  training_count INTEGER NOT NULL DEFAULT 0,
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  improvement_notes TEXT,
  deployed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL
);

ALTER TABLE public.ai_model_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage model versions"
ON public.ai_model_versions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

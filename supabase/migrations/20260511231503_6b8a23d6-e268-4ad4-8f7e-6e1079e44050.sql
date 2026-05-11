ALTER TABLE public.trend_analyses
ADD COLUMN source_platform text
GENERATED ALWAYS AS (source_data->>'platform') STORED;

CREATE INDEX IF NOT EXISTS idx_trend_analyses_source_platform
ON public.trend_analyses (source_platform);
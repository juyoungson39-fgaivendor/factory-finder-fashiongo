
CREATE OR REPLACE FUNCTION public.match_trend_analyses_by_embedding(
  query_embedding vector(768),
  match_limit int DEFAULT 20
)
RETURNS TABLE (
  trend_id uuid,
  title text,
  image_url text,
  platform text,
  trend_keywords text[],
  lifecycle_stage text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ta.id AS trend_id,
    COALESCE(ta.source_data->>'trend_name', (ta.trend_keywords)[1], 'Untitled')::text AS title,
    (ta.source_data->>'image_url')::text AS image_url,
    COALESCE(ta.source_data->>'platform', ta.source_data->>'source')::text AS platform,
    ta.trend_keywords,
    ta.lifecycle_stage::text,
    (1 - (ta.embedding <=> query_embedding))::float AS similarity
  FROM public.trend_analyses ta
  WHERE ta.embedding IS NOT NULL
  ORDER BY ta.embedding <=> query_embedding
  LIMIT match_limit;
$$;

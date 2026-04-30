CREATE OR REPLACE FUNCTION public.match_trend_analyses_by_embedding_filtered(
  query_embedding vector,
  match_limit integer DEFAULT 20,
  filter_platforms text[] DEFAULT NULL,
  filter_period_days integer DEFAULT NULL,
  filter_date_from timestamptz DEFAULT NULL,
  filter_date_to timestamptz DEFAULT NULL,
  filter_lifecycle_stages text[] DEFAULT NULL,
  filter_categories text[] DEFAULT NULL,
  filter_genders text[] DEFAULT NULL,
  filter_colors text[] DEFAULT NULL
)
RETURNS TABLE(
  trend_id uuid,
  title text,
  image_url text,
  platform text,
  trend_keywords text[],
  lifecycle_stage text,
  style_tags text[],
  similarity double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ta.id AS trend_id,
    COALESCE(ta.source_data->>'trend_name', (ta.trend_keywords)[1], 'Untitled')::text AS title,
    (ta.source_data->>'image_url')::text AS image_url,
    COALESCE(ta.source_data->>'platform', ta.source_data->>'source')::text AS platform,
    ta.trend_keywords,
    ta.lifecycle_stage::text,
    ta.style_tags,
    (1 - (ta.embedding <=> query_embedding))::float AS similarity
  FROM public.trend_analyses ta
  WHERE ta.embedding IS NOT NULL
    AND (
      filter_platforms IS NULL
      OR COALESCE(ta.source_data->>'platform', ta.source_data->>'source') = ANY(filter_platforms)
    )
    AND (
      filter_period_days IS NULL
      OR ta.created_at > now() - make_interval(days => filter_period_days)
    )
    AND (filter_date_from IS NULL OR ta.created_at >= filter_date_from)
    AND (filter_date_to IS NULL OR ta.created_at <= filter_date_to)
    AND (
      filter_lifecycle_stages IS NULL
      OR ta.lifecycle_stage::text = ANY(filter_lifecycle_stages)
    )
    AND (
      filter_categories IS NULL
      OR ta.style_tags && filter_categories
      OR ta.trend_keywords && filter_categories
    )
    AND (
      filter_genders IS NULL
      OR ta.style_tags && filter_genders
      OR ta.trend_keywords && filter_genders
    )
    AND (
      filter_colors IS NULL
      OR ta.trend_keywords && filter_colors
      OR ta.style_tags && filter_colors
    )
  ORDER BY ta.embedding <=> query_embedding
  LIMIT match_limit;
$$;
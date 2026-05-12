CREATE OR REPLACE FUNCTION public.search_trends_by_prompt_sql(
  p_keywords TEXT[],
  p_categories TEXT[],
  p_styles TEXT[],
  p_platforms TEXT[],
  p_months_back INT DEFAULT 6,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  primary_category TEXT,
  trend_keywords TEXT[],
  style_tags TEXT[],
  source_platform TEXT,
  created_at TIMESTAMPTZ,
  relevance_score NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      ta.id,
      ta.primary_category,
      ta.created_at,
      ta.source_platform,
      ta.trend_keywords,
      ta.style_tags,
      ARRAY(SELECT lower(x) FROM unnest(COALESCE(ta.trend_keywords, ARRAY[]::text[])) AS x) AS kws_lower,
      ARRAY(SELECT lower(x) FROM unnest(COALESCE(ta.style_tags, ARRAY[]::text[])) AS x) AS sts_lower
    FROM trend_analyses ta
    WHERE ta.status = 'analyzed'
      AND ta.created_at >= NOW() - (p_months_back || ' months')::INTERVAL
  ),
  p AS (
    SELECT
      ARRAY(SELECT lower(x) FROM unnest(COALESCE(p_keywords, ARRAY[]::text[])) AS x) AS kw,
      ARRAY(SELECT lower(x) FROM unnest(COALESCE(p_categories, ARRAY[]::text[])) AS x) AS cat,
      ARRAY(SELECT lower(x) FROM unnest(COALESCE(p_styles, ARRAY[]::text[])) AS x) AS st,
      ARRAY(SELECT lower(x) FROM unnest(COALESCE(p_platforms, ARRAY[]::text[])) AS x) AS pl
  )
  SELECT
    n.id,
    n.primary_category,
    n.trend_keywords,
    n.style_tags,
    n.source_platform,
    n.created_at,
    (
      cardinality(ARRAY(SELECT unnest(n.kws_lower) INTERSECT SELECT unnest(p.kw)))
      + CASE WHEN lower(COALESCE(n.primary_category,'')) = ANY(p.cat) THEN 5 ELSE 0 END
      + cardinality(ARRAY(SELECT unnest(n.sts_lower) INTERSECT SELECT unnest(p.st)))
    )::NUMERIC AS relevance_score
  FROM normalized n CROSS JOIN p
  WHERE
    (
      (cardinality(p.kw) > 0 AND n.kws_lower && p.kw)
      OR (cardinality(p.cat) > 0 AND lower(COALESCE(n.primary_category,'')) = ANY(p.cat))
      OR (cardinality(p.st) > 0 AND n.sts_lower && p.st)
    )
    AND (
      cardinality(p.pl) = 0
      OR lower(COALESCE(n.source_platform,'')) = ANY(p.pl)
    )
  ORDER BY relevance_score DESC, n.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_trends_by_prompt_sql(TEXT[],TEXT[],TEXT[],TEXT[],INT,INT) TO authenticated, anon, service_role;
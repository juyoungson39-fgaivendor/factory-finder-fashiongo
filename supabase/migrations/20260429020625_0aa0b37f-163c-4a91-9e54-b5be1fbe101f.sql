CREATE OR REPLACE FUNCTION public.get_trend_report_summary(
  p_period_days INTEGER DEFAULT 7
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_active', (SELECT COUNT(*) FROM public.trend_analyses WHERE created_at > now() - interval '90 days'),
    'new_this_week', (SELECT COUNT(*) FROM public.trend_analyses WHERE created_at > now() - make_interval(days => p_period_days)),
    'active_clusters', (SELECT COUNT(*) FROM public.trend_clusters WHERE trend_count > 0),
    'platform_stats', (
      SELECT json_agg(row_to_json(ps))
      FROM (
        SELECT
          COALESCE(source_data->>'platform', 'unknown') AS platform,
          COUNT(*) FILTER (WHERE created_at > now() - make_interval(days => p_period_days)) AS this_week,
          COUNT(*) FILTER (WHERE created_at > now() - make_interval(days => p_period_days * 2) AND created_at <= now() - make_interval(days => p_period_days)) AS last_week
        FROM public.trend_analyses
        WHERE created_at > now() - make_interval(days => p_period_days * 2)
        GROUP BY COALESCE(source_data->>'platform', 'unknown')
        ORDER BY this_week DESC
      ) ps
    ),
    'top_clusters', (
      SELECT json_agg(row_to_json(tc))
      FROM (
        SELECT cluster_name, cluster_name_kr, trend_count, weekly_growth_rate
        FROM public.trend_clusters
        WHERE trend_count > 0
        ORDER BY weekly_growth_rate DESC NULLS LAST
        LIMIT 5
      ) tc
    ),
    'top_keywords', (
      SELECT json_agg(row_to_json(tk))
      FROM (
        SELECT keyword, cnt
        FROM (
          SELECT unnest(trend_keywords) AS keyword, COUNT(*) AS cnt
          FROM public.trend_analyses
          WHERE created_at > now() - make_interval(days => p_period_days)
            AND trend_keywords IS NOT NULL
          GROUP BY keyword
          ORDER BY cnt DESC
          LIMIT 10
        ) sub
      ) tk
    ),
    'lifecycle_distribution', (
      SELECT json_agg(row_to_json(ld))
      FROM (
        SELECT lifecycle_stage, COUNT(*) AS cnt
        FROM public.trend_analyses
        WHERE lifecycle_stage IS NOT NULL AND created_at > now() - interval '30 days'
        GROUP BY lifecycle_stage
      ) ld
    ),
    'style_distribution', (
      SELECT json_agg(row_to_json(sd))
      FROM (
        SELECT tag, COUNT(*) AS cnt
        FROM (
          SELECT unnest(style_tags) AS tag
          FROM public.trend_analyses
          WHERE style_tags IS NOT NULL AND created_at > now() - interval '30 days'
        ) sub
        GROUP BY tag
        ORDER BY cnt DESC
      ) sd
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trend_report_summary(INTEGER) TO authenticated, anon, service_role;
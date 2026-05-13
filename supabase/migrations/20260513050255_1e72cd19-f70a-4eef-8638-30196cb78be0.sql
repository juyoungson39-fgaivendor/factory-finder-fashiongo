UPDATE public.trend_analyses
SET source_data = source_data || jsonb_build_object(
  'price', NULLIF(regexp_replace(source_data->'raw'->>'price', '[^0-9.]', '', 'g'), '')::numeric,
  'currency', COALESCE(source_data->'raw'->>'currency', 'USD')
)
WHERE source_data->>'platform' = 'zara'
  AND source_data ? 'raw'
  AND source_data->'raw'->>'price' ~ '^[0-9.]+$'
  AND (source_data->>'price' IS NULL OR source_data->>'price' = 'null');
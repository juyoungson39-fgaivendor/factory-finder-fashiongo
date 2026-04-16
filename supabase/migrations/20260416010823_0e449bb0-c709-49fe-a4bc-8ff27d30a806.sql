
-- 1. Enable pgvector in public schema
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- 2. Convert trend_analyses.embedding from text to vector(768)
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS embedding_vec public.vector(768);

UPDATE public.trend_analyses
SET embedding_vec = embedding::public.vector(768)
WHERE embedding IS NOT NULL AND embedding != '';

ALTER TABLE public.trend_analyses DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.trend_analyses RENAME COLUMN embedding_vec TO embedding;

-- 3. Add embedding column to sourceable_products
ALTER TABLE public.sourceable_products ADD COLUMN IF NOT EXISTS embedding public.vector(768);

-- 4. Create match_sourceable_products RPC
CREATE OR REPLACE FUNCTION public.match_sourceable_products(
  query_embedding public.vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  item_name text,
  item_name_en text,
  vendor_name text,
  category text,
  image_url text,
  unit_price numeric,
  unit_price_usd numeric,
  factory_id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sp.id,
    sp.item_name,
    sp.item_name_en,
    sp.vendor_name,
    sp.category,
    sp.image_url,
    sp.unit_price,
    sp.unit_price_usd,
    sp.factory_id,
    (1 - (sp.embedding <=> query_embedding))::float AS similarity
  FROM public.sourceable_products sp
  WHERE sp.embedding IS NOT NULL
    AND sp.status = 'active'
    AND (1 - (sp.embedding <=> query_embedding)) >= match_threshold
  ORDER BY sp.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 5. Create get_trend_product_matrix RPC
CREATE OR REPLACE FUNCTION public.get_trend_product_matrix(
  period_days int DEFAULT 7,
  min_similarity float DEFAULT 0.3,
  max_products_per_trend int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  trend_row RECORD;
  products jsonb;
BEGIN
  FOR trend_row IN
    SELECT
      ta.id AS trend_id,
      COALESCE(
        ta.source_data->>'caption',
        ta.source_data->>'title',
        array_to_string(ta.trend_keywords, ', ')
      ) AS trend_title,
      COALESCE(
        ta.source_data->>'image_url',
        ta.source_data->>'thumbnail_url'
      ) AS trend_image_url,
      COALESCE((ta.source_data->>'trend_score')::numeric, 50) AS trend_score,
      COALESCE(ta.source_data->'ai_keywords', '[]'::jsonb) AS ai_keywords,
      ta.embedding
    FROM public.trend_analyses ta
    WHERE ta.created_at >= now() - (period_days || ' days')::interval
      AND ta.status = 'analyzed'
      AND ta.embedding IS NOT NULL
    ORDER BY ta.created_at DESC
    LIMIT 100
  LOOP
    SELECT jsonb_agg(sub) INTO products
    FROM (
      SELECT
        sp.id AS product_id,
        COALESCE(sp.item_name_en, sp.item_name, 'Unknown') AS product_name,
        COALESCE(sp.vendor_name, 'Unknown') AS factory_name,
        sp.image_url,
        ROUND((1 - (sp.embedding <=> trend_row.embedding))::numeric, 4) AS similarity,
        sp.unit_price_usd AS price
      FROM public.sourceable_products sp
      WHERE sp.embedding IS NOT NULL
        AND sp.status = 'active'
        AND (1 - (sp.embedding <=> trend_row.embedding)) >= min_similarity
      ORDER BY sp.embedding <=> trend_row.embedding
      LIMIT max_products_per_trend
    ) sub;

    result := result || jsonb_build_object(
      'trend_id', trend_row.trend_id,
      'trend_title', trend_row.trend_title,
      'trend_image_url', trend_row.trend_image_url,
      'trend_score', trend_row.trend_score,
      'ai_keywords', trend_row.ai_keywords,
      'matched_products', COALESCE(products, '[]'::jsonb)
    );
  END LOOP;

  RETURN result;
END;
$$;

-- 1) Add image_embedding to trend_analyses (same dim as sourceable_products.image_embedding = 768)
ALTER TABLE public.trend_analyses
  ADD COLUMN IF NOT EXISTS image_embedding vector(768);

-- 2) ivfflat index (small dataset, lists=10 fine)
CREATE INDEX IF NOT EXISTS trend_analyses_image_embedding_idx
  ON public.trend_analyses
  USING ivfflat (image_embedding vector_cosine_ops)
  WITH (lists = 10);

CREATE INDEX IF NOT EXISTS sourceable_products_image_embedding_idx
  ON public.sourceable_products
  USING ivfflat (image_embedding vector_cosine_ops)
  WITH (lists = 10);

-- 3) Hybrid match RPC
CREATE OR REPLACE FUNCTION public.match_sourceable_products_hybrid(
  query_text_embedding vector(768),
  query_image_embedding vector(768) DEFAULT NULL,
  match_threshold double precision DEFAULT 0.40,
  max_results integer DEFAULT 20,
  w_text double precision DEFAULT 0.5,
  w_image double precision DEFAULT 0.5
)
RETURNS TABLE(
  id uuid,
  item_name text,
  item_name_en text,
  vendor_name text,
  category text,
  image_url text,
  unit_price numeric,
  unit_price_usd numeric,
  factory_id uuid,
  text_sim double precision,
  image_sim double precision,
  final_score double precision,
  used_signals text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      sp.id, sp.item_name, sp.item_name_en, sp.vendor_name, sp.category,
      sp.image_url, sp.unit_price, sp.unit_price_usd, sp.factory_id,
      CASE WHEN sp.embedding IS NOT NULL AND query_text_embedding IS NOT NULL
        THEN (1 - (sp.embedding <=> query_text_embedding))::float8 END AS text_sim,
      CASE WHEN sp.image_embedding IS NOT NULL AND query_image_embedding IS NOT NULL
        THEN (1 - (sp.image_embedding <=> query_image_embedding))::float8 END AS image_sim
    FROM public.sourceable_products sp
    WHERE sp.status = 'active'
      AND (sp.embedding IS NOT NULL OR sp.image_embedding IS NOT NULL)
  ),
  weighted AS (
    SELECT s.*,
      CASE
        WHEN text_sim IS NOT NULL AND image_sim IS NOT NULL
          THEN (w_text * text_sim + w_image * image_sim) / NULLIF(w_text + w_image, 0)
        WHEN text_sim IS NOT NULL THEN text_sim
        WHEN image_sim IS NOT NULL THEN image_sim
        ELSE NULL
      END AS final_score,
      CASE
        WHEN text_sim IS NOT NULL AND image_sim IS NOT NULL THEN ARRAY['text','image']
        WHEN text_sim IS NOT NULL THEN ARRAY['text']
        WHEN image_sim IS NOT NULL THEN ARRAY['image']
        ELSE ARRAY[]::text[]
      END AS used_signals
    FROM scored s
  )
  SELECT id, item_name, item_name_en, vendor_name, category,
         image_url, unit_price, unit_price_usd, factory_id,
         text_sim, image_sim, final_score, used_signals
  FROM weighted
  WHERE final_score IS NOT NULL AND final_score >= match_threshold
  ORDER BY final_score DESC
  LIMIT max_results;
$$;
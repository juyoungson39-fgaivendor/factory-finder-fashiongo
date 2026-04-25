-- 1-1. sourceable_products 이미지 임베딩 컬럼 추가
ALTER TABLE public.sourceable_products 
ADD COLUMN IF NOT EXISTS image_embedding vector(1536),
ADD COLUMN IF NOT EXISTS image_description text,
ADD COLUMN IF NOT EXISTS detected_colors text[],
ADD COLUMN IF NOT EXISTS detected_style text,
ADD COLUMN IF NOT EXISTS detected_material text;

-- 1-2. 이미지 임베딩 인덱스
CREATE INDEX IF NOT EXISTS idx_sourceable_products_image_embedding 
ON public.sourceable_products 
USING ivfflat (image_embedding vector_cosine_ops)
WITH (lists = 100);

-- 1-3. 매칭 피드백 테이블
CREATE TABLE IF NOT EXISTS public.match_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trend_id uuid REFERENCES public.trend_analyses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.sourceable_products(id) ON DELETE CASCADE,
  is_relevant boolean NOT NULL,
  feedback_note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(trend_id, product_id)
);

ALTER TABLE public.match_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for match_feedback" ON public.match_feedback;
CREATE POLICY "Allow all for match_feedback" ON public.match_feedback FOR ALL USING (true) WITH CHECK (true);

-- 1-5. 하이브리드 매칭 RPC
CREATE OR REPLACE FUNCTION public.match_products_hybrid(
  query_text_embedding vector(1536),
  query_image_embedding vector(1536) DEFAULT NULL,
  match_threshold float DEFAULT 0.55,
  match_count int DEFAULT 10,
  category_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, 
  text_similarity float, 
  image_similarity float, 
  combined_score float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.id,
    (1 - (sp.embedding <=> query_text_embedding))::float AS text_similarity,
    CASE 
      WHEN query_image_embedding IS NOT NULL AND sp.image_embedding IS NOT NULL 
      THEN (1 - (sp.image_embedding <=> query_image_embedding))::float
      ELSE NULL 
    END AS image_similarity,
    CASE 
      WHEN query_image_embedding IS NOT NULL AND sp.image_embedding IS NOT NULL 
      THEN (
        0.4 * (1 - (sp.embedding <=> query_text_embedding))
        + 0.4 * (1 - (sp.image_embedding <=> query_image_embedding))
        + 0.2 * CASE 
          WHEN category_filter IS NOT NULL AND sp.fg_category = category_filter THEN 1.0
          ELSE 0.5
        END
      )::float
      ELSE (1 - (sp.embedding <=> query_text_embedding))::float
    END AS combined_score
  FROM public.sourceable_products sp
  WHERE sp.embedding IS NOT NULL
    AND (category_filter IS NULL OR category_filter = '' OR sp.fg_category = category_filter)
    AND CASE
      WHEN query_image_embedding IS NOT NULL AND sp.image_embedding IS NOT NULL 
      THEN (
        0.4 * (1 - (sp.embedding <=> query_text_embedding))
        + 0.4 * (1 - (sp.image_embedding <=> query_image_embedding))
        + 0.2 * CASE WHEN category_filter IS NOT NULL AND sp.fg_category = category_filter THEN 1.0 ELSE 0.5 END
      ) >= match_threshold
      ELSE (1 - (sp.embedding <=> query_text_embedding)) >= match_threshold
    END
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
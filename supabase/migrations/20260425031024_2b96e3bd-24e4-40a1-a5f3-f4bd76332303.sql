-- 1. 기존 텍스트 임베딩(3072차원) → 768차원으로 전환을 위해 NULL 처리 후 컬럼 변경
ALTER TABLE public.sourceable_products DROP COLUMN IF EXISTS image_embedding;
UPDATE public.sourceable_products SET embedding = NULL;
ALTER TABLE public.sourceable_products ALTER COLUMN embedding TYPE vector(768);

-- 2. image_embedding (768차원) 및 분석 메타 컬럼 추가
ALTER TABLE public.sourceable_products
  ADD COLUMN image_embedding vector(768),
  ADD COLUMN IF NOT EXISTS image_description text,
  ADD COLUMN IF NOT EXISTS detected_colors text[],
  ADD COLUMN IF NOT EXISTS detected_style text,
  ADD COLUMN IF NOT EXISTS detected_material text;

-- 3. 이미지 임베딩 인덱스
CREATE INDEX IF NOT EXISTS idx_sourceable_products_image_embedding
ON public.sourceable_products
USING ivfflat (image_embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. trend_analyses.embedding도 768로 정렬 (기존 데이터 NULL 후 변경)
DO $$
DECLARE
  v_typmod int;
BEGIN
  SELECT atttypmod INTO v_typmod FROM pg_attribute
  WHERE attrelid = 'public.trend_analyses'::regclass AND attname = 'embedding';
  IF v_typmod <> 768 THEN
    UPDATE public.trend_analyses SET embedding = NULL;
    EXECUTE 'ALTER TABLE public.trend_analyses ALTER COLUMN embedding TYPE vector(768)';
  END IF;
END $$;

-- 5. match_feedback 테이블 (이미 존재 - 스키마만 보강)
-- (기존에 trend_id, product_id, is_relevant, feedback_note 존재)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_feedback_trend_product_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.match_feedback
        ADD CONSTRAINT match_feedback_trend_product_unique UNIQUE (trend_id, product_id);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- 6. 기존 RPC 제거 후 768 차원으로 재생성
DROP FUNCTION IF EXISTS public.match_products_hybrid(vector, vector, double precision, integer, text);

CREATE OR REPLACE FUNCTION public.match_products_hybrid(
  query_text_embedding vector(768),
  query_image_embedding vector(768) DEFAULT NULL,
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
-- ============================================================
-- Vector Search Infrastructure for Trend Matching
-- ============================================================
-- 스키마 확인 결과 실제 테이블 매핑:
--   소싱 상품 테이블 → sourceable_products
--   트렌드 테이블   → trend_analyses
-- ============================================================

-- 1. pgvector extension 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. sourceable_products: embedding 컬럼 추가
-- ============================================================
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- ============================================================
-- 3. trend_analyses: AI 분석 및 embedding 컬럼 추가
-- ============================================================
ALTER TABLE public.trend_analyses
  ADD COLUMN IF NOT EXISTS embedding    vector(768),
  ADD COLUMN IF NOT EXISTS ai_analyzed  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_keywords  jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trend_score  integer DEFAULT 0;

-- ============================================================
-- 4. IVFFlat 인덱스 생성 (cosine similarity)
--    pgvector 권장: lists ≈ sqrt(rows), 소규모 DB는 100으로 충분
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sourceable_products_embedding
  ON public.sourceable_products
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_trend_analyses_embedding
  ON public.trend_analyses
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================
-- 5. RPC: 코사인 유사도 기반 소싱 상품 매칭
--
-- sourceable_products 컬럼 매핑:
--   product_name   ← item_name      (상품명)
--   factory_name   ← vendor_name    (공장/업체명)
--   image_url      ← image_url
--   price          ← unit_price_usd (USD 기준, null이면 unit_price)
--   category       ← category
--   fg_category    ← fg_category    (FashionGo 카테고리)
--   factory_id     ← factory_id     (공장 FK)
-- ※ stock_quantity: 스키마에 없는 컬럼 → NULL 반환
-- ============================================================
CREATE OR REPLACE FUNCTION match_sourceable_products(
  query_embedding  vector(768),
  match_threshold  float   DEFAULT 0.5,
  match_count      int     DEFAULT 20
)
RETURNS TABLE (
  id             uuid,
  product_name   text,
  factory_name   text,
  factory_id     uuid,
  image_url      text,
  price          numeric,
  stock_quantity integer,
  category       text,
  fg_category    text,
  similarity     float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    sp.id,
    sp.item_name                                        AS product_name,
    sp.vendor_name                                      AS factory_name,
    sp.factory_id,
    sp.image_url,
    COALESCE(sp.unit_price_usd, sp.unit_price)          AS price,
    NULL::integer                                        AS stock_quantity,
    sp.category,
    sp.fg_category,
    1 - (sp.embedding <=> query_embedding)              AS similarity
  FROM public.sourceable_products sp
  WHERE
    sp.embedding IS NOT NULL
    AND 1 - (sp.embedding <=> query_embedding) >= match_threshold
  ORDER BY sp.embedding <=> query_embedding   -- cosine distance 오름차순 = similarity 내림차순
  LIMIT match_count;
$$;

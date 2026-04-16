-- ============================================================
-- Trend × Product Matrix RPC
-- trend_analyses(embedding) × sourceable_products(embedding)
-- 코사인 유사도 기반 매핑표를 한 번의 RPC 호출로 반환
-- ============================================================

CREATE OR REPLACE FUNCTION get_trend_product_matrix(
  period_days          int   DEFAULT 7,
  min_similarity       float DEFAULT 0.3,
  max_products_per_trend int DEFAULT 5
)
RETURNS TABLE (
  trend_id         uuid,
  trend_title      text,
  trend_image_url  text,
  trend_score      int,
  ai_keywords      jsonb,
  matched_products jsonb   -- [{product_id, product_name, factory_name, image_url, similarity, price}]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ta.id                                              AS trend_id,
    -- trend_title: source_data.trend_name → trend_keywords 조합 순서
    COALESCE(
      NULLIF(ta.source_data->>'trend_name', ''),
      array_to_string(ta.trend_keywords, ', ')
    )                                                  AS trend_title,
    ta.source_data->>'image_url'                       AS trend_image_url,
    ta.trend_score,
    COALESCE(ta.ai_keywords, '[]'::jsonb)              AS ai_keywords,
    -- LATERAL 서브쿼리: 각 트렌드에 대해 상위 N개 매칭 상품을 JSONB 배열로 집계
    COALESCE(mp.products, '[]'::jsonb)                 AS matched_products
  FROM public.trend_analyses ta
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_id',   sp.id,
        'product_name', COALESCE(sp.item_name, sp.item_name_en, ''),
        'factory_name', COALESCE(sp.vendor_name, ''),
        'image_url',    COALESCE(sp.image_url, ''),
        'similarity',   ROUND((1 - (sp.embedding <=> ta.embedding))::numeric, 4),
        'price',        COALESCE(sp.unit_price_usd, sp.unit_price)
      )
      ORDER BY (sp.embedding <=> ta.embedding)   -- cosine distance 오름차순 = similarity 내림차순
    ) AS products
    FROM (
      SELECT
        sp.id,
        sp.item_name,
        sp.item_name_en,
        sp.vendor_name,
        sp.image_url,
        sp.embedding,
        sp.unit_price_usd,
        sp.unit_price
      FROM public.sourceable_products sp
      WHERE
        sp.embedding IS NOT NULL
        AND (1 - (sp.embedding <=> ta.embedding)) >= min_similarity
      ORDER BY (sp.embedding <=> ta.embedding)
      LIMIT max_products_per_trend
    ) sp
  ) mp ON true
  WHERE
    ta.embedding IS NOT NULL
    AND ta.created_at >= (NOW() - (period_days * INTERVAL '1 day'))
  ORDER BY
    ta.trend_score DESC NULLS LAST,
    ta.created_at DESC
  LIMIT 50;
$$;

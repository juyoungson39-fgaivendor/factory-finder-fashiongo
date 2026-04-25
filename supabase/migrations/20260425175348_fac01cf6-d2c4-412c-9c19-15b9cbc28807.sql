
-- 1) Providers 추가
INSERT INTO public.ai_providers (provider_key, display_name, description, category, required_secrets, is_active, is_implemented)
VALUES
  ('apify', 'Apify', 'Pinterest/SHEIN/SNS 등 다양한 사이트 크롤링 액터 실행', 'data_collection', ARRAY['APIFY_API_TOKEN'], true, true),
  ('serpapi', 'SerpAPI', 'Google Images/Search 결과 수집', 'data_collection', ARRAY['SERPAPI_KEY'], true, true),
  ('openai_direct', 'OpenAI (Direct)', 'OpenAI API 직접 호출 (가능하면 Lovable AI Gateway 사용 권장)', 'llm', ARRAY['OPENAI_API_KEY'], false, true),
  ('microlink', 'Microlink', 'URL 메타데이터/대표 이미지 추출 (무료 티어 가능)', 'data_collection', ARRAY[]::text[], true, true),
  ('firecrawl', 'Firecrawl', '웹페이지 크롤링/스크래핑 (마크다운/구조화 데이터)', 'data_collection', ARRAY['FIRECRAWL_API_KEY'], true, true)
ON CONFLICT (provider_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  required_secrets = EXCLUDED.required_secrets,
  is_implemented = EXCLUDED.is_implemented;

-- 2) Capabilities 추가
INSERT INTO public.ai_capabilities (capability_key, display_name, description, category, used_by)
VALUES
  ('web_scraping', '웹 스크래핑', '특정 URL/사이트에서 구조화된 데이터 추출 (공장 정보, 상품 페이지 등)', 'data_collection',
   ARRAY['scrape-factory','scrape-vendor-products','scrape-fashiongo-trends','collect-pinterest-image-trends','collect-shein-trends','collect-sns-trends']),
  ('web_search', '웹 검색', 'Google/이미지 검색 결과 수집', 'data_collection',
   ARRAY['collect-google-image-trends','collect-amazon-image-trends','search-product-images']),
  ('link_metadata', '링크 메타데이터 추출', 'OG/Twitter 카드 등 페이지 미리보기 데이터 추출', 'data_collection',
   ARRAY['collect-magazine-trends'])
ON CONFLICT (capability_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  used_by = EXCLUDED.used_by;

-- 3) 신규 capability에 대한 기본 Provider 연결 (기존 코드 동작과 일치)
INSERT INTO public.ai_capability_bindings (capability_key, provider_key, model_name)
VALUES
  ('web_scraping', 'firecrawl', NULL),
  ('web_search', 'serpapi', NULL),
  ('link_metadata', 'microlink', NULL),
  ('trend_collection', 'apify', NULL)
ON CONFLICT (capability_key) DO UPDATE SET
  provider_key = EXCLUDED.provider_key,
  model_name = EXCLUDED.model_name,
  updated_at = now();

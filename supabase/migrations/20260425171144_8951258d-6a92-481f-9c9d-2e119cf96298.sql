-- ============================================================
-- AI Tool Registry Foundation
-- ============================================================

-- 1. Providers
CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,        -- 'gemini', 'vertex_ai', 'lovable_ai', 'fal', 'zhiyitech'
  display_name text NOT NULL,
  description text,
  category text NOT NULL,                   -- 'llm', 'image', 'embedding', 'training', 'data_collection'
  required_secrets text[] NOT NULL DEFAULT '{}',  -- ['GEMINI_API_KEY']
  is_active boolean NOT NULL DEFAULT true,
  is_implemented boolean NOT NULL DEFAULT false,  -- 어댑터가 실제로 구현됐는지
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read providers"
  ON public.ai_providers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage providers"
  ON public.ai_providers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Capabilities
CREATE TABLE public.ai_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL UNIQUE,      -- 'image_embedding', 'image_generation', ...
  display_name text NOT NULL,
  description text,
  category text NOT NULL,                   -- 'image', 'text', 'embedding', 'training', 'data_collection'
  used_by text[] NOT NULL DEFAULT '{}',     -- ['batch-generate-image-embeddings']
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read capabilities"
  ON public.ai_capabilities FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage capabilities"
  ON public.ai_capabilities FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Capability ↔ Provider Binding
CREATE TABLE public.ai_capability_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL UNIQUE REFERENCES public.ai_capabilities(capability_key) ON DELETE CASCADE,
  provider_key text NOT NULL REFERENCES public.ai_providers(provider_key) ON DELETE RESTRICT,
  model_name text,                          -- 'gemini-2.0-flash', 'text-embedding-004', ...
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_capability_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read bindings"
  ON public.ai_capability_bindings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage bindings"
  ON public.ai_capability_bindings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_ai_capability_bindings_updated_at
  BEFORE UPDATE ON public.ai_capability_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Seed: Providers
-- ============================================================
INSERT INTO public.ai_providers (provider_key, display_name, description, category, required_secrets, is_implemented) VALUES
  ('lovable_ai', 'Lovable AI Gateway', 'Gemini, GPT-5 등 다양한 모델을 단일 게이트웨이로 호출', 'llm', ARRAY['LOVABLE_API_KEY'], true),
  ('gemini', 'Gemini Direct (Nano Banana 포함)', 'Google Generative Language API 직접 호출. 텍스트/이미지/임베딩/Nano Banana 이미지 생성', 'image', ARRAY['GEMINI_API_KEY'], true),
  ('vertex_ai', 'Vertex AI', 'Google Cloud Vertex AI - 모델 학습/파인튜닝/엔터프라이즈 추론', 'training', ARRAY['GOOGLE_SERVICE_ACCOUNT_KEY','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_LOCATION'], false),
  ('fal', 'fal.ai', 'AI 이미지 생성/변환 (모델 착장샷 등)', 'image', ARRAY['FAL_KEY'], true),
  ('zhiyitech', 'Zhiyitech (知衣)', '중국 패션 트렌드 데이터 수집 (placeholder)', 'data_collection', ARRAY['ZHIYITECH_API_KEY'], false);

-- ============================================================
-- Seed: Capabilities
-- ============================================================
INSERT INTO public.ai_capabilities (capability_key, display_name, description, category, used_by) VALUES
  ('image_analysis', '이미지 분석 (Vision)', '상품 이미지를 분석하여 색상/소재/스타일 등 속성 추출', 'image', ARRAY['batch-generate-image-embeddings','analyze-product-image']),
  ('image_embedding', '이미지 임베딩 생성', '이미지 설명 텍스트로부터 벡터 임베딩 생성', 'embedding', ARRAY['batch-generate-image-embeddings','generate-embedding']),
  ('text_embedding', '텍스트 임베딩 생성', '상품/트렌드 텍스트의 벡터 임베딩', 'embedding', ARRAY['generate-embedding','match-trend-to-products']),
  ('image_generation', '이미지 생성 (Nano Banana 등)', '텍스트 프롬프트로 새 이미지 생성', 'image', ARRAY['generate-model-image','convert-product-image']),
  ('image_edit', '이미지 편집/변환', '기존 이미지에 모델 합성, 스타일 변환 등', 'image', ARRAY['convert-product-image','generate-vendor-model']),
  ('text_generation', '텍스트 생성 (LLM)', 'AI 기반 추천 키워드/리포트/매칭 분석 생성', 'text', ARRAY['generate-sourcing-report','recommend-keywords','match-trend-to-products']),
  ('model_training', '모델 학습/파인튜닝', '교정 데이터로 점수 모델 학습', 'training', ARRAY['trigger-finetuning','poll-training-job']),
  ('trend_collection', '트렌드 데이터 수집', '외부 소스에서 패션 트렌드 데이터 수집', 'data_collection', ARRAY['collect-magazine-trends','collect-sns-trends','collect-shein-trends']);

-- ============================================================
-- Seed: Default Bindings (현재 코드에서 실제 사용 중인 Provider로)
-- ============================================================
INSERT INTO public.ai_capability_bindings (capability_key, provider_key, model_name) VALUES
  ('image_analysis',   'gemini',     'gemini-2.0-flash'),
  ('image_embedding',  'gemini',     'text-embedding-004'),
  ('text_embedding',   'gemini',     'gemini-embedding-001'),
  ('image_generation', 'gemini',     'gemini-2.5-flash-image'),
  ('image_edit',       'fal',        'fal-ai/flux'),
  ('text_generation',  'lovable_ai', 'google/gemini-2.5-flash'),
  ('model_training',   'vertex_ai',  NULL),
  ('trend_collection', 'zhiyitech',  NULL);
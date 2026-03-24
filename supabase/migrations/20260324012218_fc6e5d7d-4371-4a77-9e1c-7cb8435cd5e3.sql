
-- 1. 소싱 타깃 상품 테이블 (FashionGo / SNS / 타 사이트에서 수집한 타깃 상품)
CREATE TABLE public.sourcing_target_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'fashiongo', -- 'fashiongo' | 'sns' | 'other'
  item_name TEXT NOT NULL,
  item_name_en TEXT,
  style_no TEXT,
  vendor_name TEXT,
  category TEXT,
  fg_category TEXT,
  unit_price NUMERIC,
  unit_price_usd NUMERIC,
  image_url TEXT,
  source_url TEXT,
  options JSONB DEFAULT '{}',
  weight NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sourcing_target_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sourcing targets"
  ON public.sourcing_target_products FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. 소싱 가능 상품 테이블 (Angel Agent 추출 또는 CSV 업로드)
CREATE TABLE public.sourceable_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'agent', -- 'agent' | 'csv'
  factory_id UUID REFERENCES public.factories(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  item_name_en TEXT,
  style_no TEXT,
  vendor_name TEXT,
  category TEXT,
  fg_category TEXT,
  unit_price NUMERIC,
  unit_price_usd NUMERIC,
  image_url TEXT,
  source_url TEXT,
  options JSONB DEFAULT '{}',
  weight NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  trend_analysis_id UUID REFERENCES public.trend_analyses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sourceable_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sourceable products"
  ON public.sourceable_products FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

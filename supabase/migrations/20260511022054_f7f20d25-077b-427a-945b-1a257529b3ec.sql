
CREATE TABLE IF NOT EXISTS public.angel_agent_stages (
  stage_no smallint PRIMARY KEY CHECK (stage_no BETWEEN 1 AND 7),
  name text NOT NULL,
  description text,
  page_route text,
  automation_level text CHECK (automation_level IN ('auto','semi','manual')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  last_run_at timestamptz,
  current_item_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_aas_upd ON public.angel_agent_stages;
CREATE TRIGGER trg_aas_upd BEFORE UPDATE ON public.angel_agent_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.angel_agent_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_rw_aas" ON public.angel_agent_stages;
CREATE POLICY "public_rw_aas" ON public.angel_agent_stages FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.angel_agent_stages (stage_no, name, description, page_route, automation_level) VALUES
(1, '트렌드 분석', 'SNS·커머스 트렌드 자동 수집 + 키워드/카테고리 분류', '/trend', 'auto'),
(2, '타겟상품 리스팅', '트렌드 키워드 → 타깃 상품 정의', '/products/target-fg', 'semi'),
(3, '소싱가능 상품과 매칭', '타겟 vs 등록 공장 상품 자동 매칭', '/ai-search', 'auto'),
(4, '상품 컨펌', '매칭 후보 검토 → 좋아요/싫어요', '/products/sourceable-agent', 'manual'),
(5, '벤더 배분', '컨펌 상품을 Sassy Look / G1K 등에 배분', '/ai-vendors', 'semi'),
(6, '패션고 변환', '이미지·번역·사이즈·가격 FG 규격 자동 변환', '/settings/pricing', 'auto'),
(7, 'FG 등록', 'FashionGo vendor portal 최종 업로드', '/ai-vendors', 'auto')
ON CONFLICT (stage_no) DO UPDATE SET 
  name = EXCLUDED.name, 
  description = EXCLUDED.description,
  page_route = EXCLUDED.page_route,
  automation_level = EXCLUDED.automation_level;

CREATE OR REPLACE FUNCTION public.get_angel_agent_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  v_count integer;
BEGIN
  BEGIN
    EXECUTE 'SELECT COUNT(*) FROM public.trends WHERE captured_at >= now() - interval ''7 days''' INTO v_count;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      EXECUTE 'SELECT COUNT(*) FROM public.trend_items WHERE created_at >= now() - interval ''7 days''' INTO v_count;
    EXCEPTION WHEN OTHERS THEN v_count := 0; END;
  END;
  result := result || jsonb_build_object('s1', COALESCE(v_count, 0));

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.target_products WHERE status=''active''' INTO v_count;
  EXCEPTION WHEN OTHERS THEN v_count := 0; END;
  result := result || jsonb_build_object('s2', COALESCE(v_count, 0));

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.matches WHERE status=''candidate''' INTO v_count;
  EXCEPTION WHEN OTHERS THEN v_count := 0; END;
  result := result || jsonb_build_object('s3', COALESCE(v_count, 0));

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.matches WHERE status=''pending_confirm''' INTO v_count;
  EXCEPTION WHEN OTHERS THEN v_count := 0; END;
  result := result || jsonb_build_object('s4', COALESCE(v_count, 0));

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.matches WHERE status=''approved'' AND vendor_id IS NULL' INTO v_count;
  EXCEPTION WHEN OTHERS THEN v_count := 0; END;
  result := result || jsonb_build_object('s5', COALESCE(v_count, 0));

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.fg_listings WHERE status=''converting''' INTO v_count;
  EXCEPTION WHEN OTHERS THEN v_count := 0; END;
  result := result || jsonb_build_object('s6', COALESCE(v_count, 0));

  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.fg_listings WHERE status=''live''' INTO v_count;
  EXCEPTION WHEN OTHERS THEN v_count := 0; END;
  result := result || jsonb_build_object('s7', COALESCE(v_count, 0));

  RETURN result;
END;
$$;

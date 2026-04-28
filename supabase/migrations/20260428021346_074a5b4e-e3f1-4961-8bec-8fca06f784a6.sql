-- 1. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_order INT NOT NULL DEFAULT 0,
  number_label TEXT,
  name TEXT NOT NULL,
  tag TEXT,
  phase TEXT,
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status_color TEXT DEFAULT 'amber',
  deadlines TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_order ON public.projects(display_order);

-- 2. PROJECT ITEMS
CREATE TABLE IF NOT EXISTS public.project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('done', 'blocker', 'next')),
  content TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_items_project ON public.project_items(project_id);

-- 3. DASHBOARD META
CREATE TABLE IF NOT EXISTS public.dashboard_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_key TEXT UNIQUE NOT NULL,
  label TEXT, value TEXT, description TEXT, color TEXT,
  display_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $func$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$func$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_projects_updated ON public.projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_meta_updated ON public.dashboard_meta;
CREATE TRIGGER trg_meta_updated BEFORE UPDATE ON public.dashboard_meta FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_read_projects" ON public.projects;
CREATE POLICY "open_read_projects" ON public.projects FOR SELECT USING (true);
DROP POLICY IF EXISTS "open_write_projects" ON public.projects;
CREATE POLICY "open_write_projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_read_items" ON public.project_items;
CREATE POLICY "open_read_items" ON public.project_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "open_write_items" ON public.project_items;
CREATE POLICY "open_write_items" ON public.project_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "open_read_meta" ON public.dashboard_meta;
CREATE POLICY "open_read_meta" ON public.dashboard_meta FOR SELECT USING (true);
DROP POLICY IF EXISTS "open_write_meta" ON public.dashboard_meta;
CREATE POLICY "open_write_meta" ON public.dashboard_meta FOR ALL USING (true) WITH CHECK (true);

-- 6. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_meta;

-- SEED DATA
DELETE FROM public.dashboard_meta;
DELETE FROM public.projects;

INSERT INTO public.dashboard_meta (meta_key, label, value, description, color, display_order) VALUES
('summary_dday',     'D-Day',         'D-45',     '6/12 증빙까지',                'red',     1),
('summary_reg',      '실등록 진척',    '21 / 20',  '정량 충족 · 품질 검증 필요',    'green',   2),
('summary_buyer',    '바이어 반응',    '0 / 1+',   '미국 채널 미연결',             'red',     3),
('summary_revenue',  'AD+ 4월 매출',   '$14K',     '월 환산 · Bloom Daily 80%',    'default', 4),
('insight',          '전체 그림 한 줄', '실등록(21개)은 이미 충족했으나 바이어 반응 채널이 0이라 정성 기준이 비어 있는 상태. 모든 줄기가 결국 NHN Global 측 단일 담당자 1명 배정이라는 단일 액션에 묶여 있음. 5/8 후속 미팅에서 이 매듭이 풀리느냐가 6/12 결과를 결정.', NULL, 'blue', 0);

DO $seed$
DECLARE p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID; p6 UUID;
BEGIN
INSERT INTO public.projects (display_order, number_label, name, tag, phase, progress, status_color, deadlines)
VALUES (1, '①', 'AI 스프린톤3 TF · 6/12 증빙', 'core', 'Phase 1 진행 중 · 인재개발팀 면담 4/27 완료', 55, 'blue', 'D-45 · 6/12 증빙 (실등록 20+ / 바이어 반응 1+) | D-10 · 5/8 후속 미팅')
RETURNING id INTO p1;
INSERT INTO public.project_items (project_id, category, content, display_order) VALUES
(p1, 'done', 'R&R 정리 · 6단계 발화 가이드', 1),
(p1, 'done', '화이트보드 프레임 (가치사슬)', 2),
(p1, 'done', '인재개발팀 1차 면담', 3),
(p1, 'done', '조직 회색지대 frame 정립', 4),
(p1, 'blocker', 'NHN Global 담당자 미배정', 1),
(p1, 'blocker', '바이어 FGI / 클릭 데이터 부재', 2),
(p1, 'blocker', '커머스↔본사 R&R 회색지대', 3),
(p1, 'next', '5/8 후속 미팅 자료 1차 공유', 1),
(p1, 'next', '5월 첫 주 협업 채널 개설', 2),
(p1, 'next', '증빙 범위 본사 합의', 3);

INSERT INTO public.projects (display_order, number_label, name, tag, phase, progress, status_color, deadlines)
VALUES (2, '②', 'Factory Finder (Lovable)', 'active', 'Phase 1.5 · Supabase muavrctuayyvfzgaygmu', 35, 'amber', '스프린톤 증빙 인프라와 직결 · 6/12 의존성 있음')
RETURNING id INTO p2;
INSERT INTO public.project_items (project_id, category, content, display_order) VALUES
(p2, 'done', '21개 공장 동기화 (synced)', 1),
(p2, 'done', 'JINGRU 인민폐 가격 DB 적용', 2),
(p2, 'done', '이미지 Storage 매칭 (37개 상품)', 3),
(p2, 'done', '가짜 코드 40개 정리', 4),
(p2, 'blocker', 'CORS 미해결', 1),
(p2, 'blocker', '스팸 공장 정리 미완', 2),
(p2, 'blocker', '1688 동기화 스크립트 미실행', 3),
(p2, 'blocker', 'Pending 97개 대기', 4),
(p2, 'next', 'overall_score 재계산 (21개)', 1),
(p2, 'next', 'Pending 97개 일괄 동기화', 2),
(p2, 'next', 'Alibaba Youthmi 수집', 3);

INSERT INTO public.projects (display_order, number_label, name, tag, phase, progress, status_color, deadlines)
VALUES (3, '③', 'Asia Direct+ 운영', 'active', '16 벤더 운영 · Bloom Daily 메인 채널 (W1 시작)', 40, 'amber', '월 GMV $10K (3개월) | 재구매율 30% (6개월) | AD+ GMV 25% (12개월)')
RETURNING id INTO p3;
INSERT INTO public.project_items (project_id, category, content, display_order) VALUES
(p3, 'done', '16 벤더 4월 매출 집계', 1),
(p3, 'done', 'Bloom Daily $4,722/10일 검증', 2),
(p3, 'done', '4단계 12개월 로드맵 설계', 3),
(p3, 'done', '미국 관세 환경 분석', 4),
(p3, 'blocker', '8개 벤더 매출 $0 (활성화 필요)', 1),
(p3, 'blocker', 'AI 사진 정책 본사 미확인', 2),
(p3, 'blocker', '벤더 어드민 권한 불명확', 3),
(p3, 'blocker', '10-14일 배송 리드타임', 4),
(p3, 'next', 'W1 상품 20개 선별 + AI 사진', 1),
(p3, 'next', '주 5개 신상 드롭 리듬', 2),
(p3, 'next', 'DiYun 전략 미팅', 3),
(p3, 'next', 'TikTok 트렌드 연동', 4);

INSERT INTO public.projects (display_order, number_label, name, tag, phase, progress, status_color, deadlines)
VALUES (4, '④', '중국 공장 발굴 (1688)', 'active', '중산·광저우 출장 완료 · TOP 50 평가 + 신규 9개 추가', 70, 'green', NULL)
RETURNING id INTO p4;
INSERT INTO public.project_items (project_id, category, content, display_order) VALUES
(p4, 'done', 'TOP 50 FG 적합도 평가', 1),
(p4, 'done', '중산·광저우 9개 직접 방문', 2),
(p4, 'done', '★ 凯瑞达 72점 / 品力 65점 확정', 3),
(p4, 'done', 'Zhiyitech 견적 한국어화', 4),
(p4, 'blocker', '신규 7개 중 5개 남성복 (FG 부적합)', 1),
(p4, 'blocker', '여성복: 卡芙瑞 62 / 杰斯特 58 (조건부)', 2),
(p4, 'next', 'Angel Program 신규 3개 온보딩 (M4-6)', 1),
(p4, 'next', 'Curvy Breeze 플러스사이즈 보강', 2),
(p4, 'next', 'Shein 납품 공장 추가 발굴', 3);

INSERT INTO public.projects (display_order, number_label, name, tag, phase, progress, status_color, deadlines)
VALUES (5, '⑤', '8단계 자동화 파이프라인', 'paused', 'Stage 1-3 부분 구현 · Stage 4-8 미진행', 25, 'amber', NULL)
RETURNING id INTO p5;
INSERT INTO public.project_items (project_id, category, content, display_order) VALUES
(p5, 'done', 'Stage 1: zhiyitech 트렌드 감지 검토', 1),
(p5, 'done', 'Stage 2-3: Factory Finder (부분)', 2),
(p5, 'done', 'Phase 1~4 수익 모델링', 3),
(p5, 'done', '$447B 시장 1% 시나리오', 4),
(p5, 'blocker', 'FG 자동등록 API 미연결', 1),
(p5, 'blocker', '1688 공식 데이터 라인 부재', 2),
(p5, 'blocker', 'NHN Cloud 인프라 예산 미승인', 3),
(p5, 'blocker', '크롤링 차단 리스크', 4),
(p5, 'next', 'FG 개발팀 협업 채널 (W7-8)', 1),
(p5, 'next', 'Phase 2 진입 시 인프라 50-80만/월', 2),
(p5, 'next', '테스트 매입 자금 500-1,000만', 3);

INSERT INTO public.projects (display_order, number_label, name, tag, phase, progress, status_color, deadlines)
VALUES (6, '⑥', 'Zhiyitech 海外探款 도입 검토', 'paused', '트렌드 감지 SaaS · 견적서 한국어 변환 4/27 완료', 20, 'amber', NULL)
RETURNING id INTO p6;
INSERT INTO public.project_items (project_id, category, content, display_order) VALUES
(p6, 'done', '견적서 22페이지 한국어 PDF', 1),
(p6, 'done', '가격·기능 사양 정리', 2),
(p6, 'blocker', '법인 카드 결제 라인 부재', 1),
(p6, 'blocker', '보안·약관 검토 필요', 2),
(p6, 'blocker', '중국계 SaaS 정책 불명확', 3),
(p6, 'next', '5월 중순 본사 외부 SaaS 라인 연결', 1),
(p6, 'next', '사업개발/법무/정보보안 라우팅', 2);
END $seed$;
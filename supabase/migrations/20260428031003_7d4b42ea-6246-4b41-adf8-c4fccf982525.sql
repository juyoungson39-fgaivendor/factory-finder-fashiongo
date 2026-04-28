-- 1. team_members 테이블
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#534AB7',
  emoji TEXT,
  role TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_read_team_members" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "open_write_team_members" ON public.team_members FOR ALL USING (true) WITH CHECK (true);

-- 2. owner_id / assignee_id 컬럼 추가
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;

ALTER TABLE public.project_items
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;

-- 3. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;

-- 4. 프로젝트 재정렬 (Asia Direct+ 등 삭제 후 1~5로 연속)
-- 먼저 활성 프로젝트들을 display_order 순으로 재할당
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY display_order, created_at) AS rn
  FROM public.projects
)
UPDATE public.projects p
SET 
  display_order = ordered.rn,
  number_label = CASE ordered.rn
    WHEN 1 THEN '①'
    WHEN 2 THEN '②'
    WHEN 3 THEN '③'
    WHEN 4 THEN '④'
    WHEN 5 THEN '⑤'
    ELSE '⑥'
  END
FROM ordered
WHERE p.id = ordered.id;

-- 5. 헤더 부제 업데이트
UPDATE public.dashboard_meta
SET value = 'Factory Finder · Angel Program 전용 진척도 — 6/12 딥 스프린톤 증빙을 정점으로'
WHERE meta_key = 'subtitle';

INSERT INTO public.dashboard_meta (meta_key, label, value, display_order)
SELECT 'subtitle', 'subtitle', 'Factory Finder · Angel Program 전용 진척도 — 6/12 딥 스프린톤 증빙을 정점으로', 0
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_meta WHERE meta_key = 'subtitle');
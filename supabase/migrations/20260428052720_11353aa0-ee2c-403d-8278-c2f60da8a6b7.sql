
-- ============ 1-1: Summary cards ============
-- Remove old summary_team (the buggy empty-value one) and ensure summary_factories present.
-- (summary_revenue may not exist in this snapshot; safe DELETE)
DELETE FROM public.dashboard_meta WHERE meta_key IN ('summary_revenue', 'summary_team');

-- Insert summary_factories if not present
INSERT INTO public.dashboard_meta (meta_key, label, value, description, color, display_order)
SELECT 'summary_factories', '등록 공장', '21 / 50', 'Top 50 중 21개 등록 완료', 'blue', 4
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_meta WHERE meta_key = 'summary_factories');

-- ============ 1-2: Insight ============
UPDATE public.dashboard_meta
SET value = '실등록(21개)은 정량 충족했으나 바이어 반응 0이라 정성 기준이 빈 상태. 모든 줄기가 결국 NHN Global 측 Angel Program 단일 담당자 1명 배정에 묶여 있음. 5/8 후속 미팅에서 이 매듭이 풀리느냐가 6/12 결과를 결정.'
WHERE meta_key = 'insight';

-- Subtitle update to "5개 줄기" (we now have 5 projects)
UPDATE public.dashboard_meta
SET value = 'Factory Finder / Angel Program 5개 줄기 — 6/12 딥 스프린톤 증빙을 정점으로'
WHERE meta_key = 'subtitle';

-- ============ 1-3: Projects ============
-- ① 6/12 증빙 & TF 협업 (was AI 스프린톤3 TF)
UPDATE public.projects SET
  number_label = '①',
  name = '6/12 증빙 & TF 협업',
  tag = 'core',
  progress = 55,
  status_color = 'blue',
  phase = 'Phase 1 진행 중 · 인재개발팀 면담 4/27 완료',
  deadlines = 'D-45 · 6/12 증빙 (실등록 20+ / 바이어 반응 1+) | D-10 · 5/8 후속 미팅',
  display_order = 1
WHERE id = '0759a40c-27b2-4879-86ac-4c483fd9d178';

-- ② Factory Finder (Lovable+Supabase)
UPDATE public.projects SET
  number_label = '②',
  name = 'Factory Finder (Lovable+Supabase)',
  tag = 'active',
  progress = 35,
  display_order = 2
WHERE id = 'ad7b4041-7249-45c9-bff9-0c1a595a2c71';

-- ③ 공장 발굴 & 검증 (already inserted via prior INSERT id=69984614-38a6-44f2-9084-57b8b86c501b)
-- Ensure ordering & metadata
UPDATE public.projects SET
  number_label = '③',
  name = '공장 발굴 & 검증',
  tag = 'active',
  progress = 70,
  status_color = 'green',
  phase = '중산·광저우 출장 완료 · Top 50 평가 + 신규 9개 추가',
  display_order = 3
WHERE id = '69984614-38a6-44f2-9084-57b8b86c501b';

-- Seed items for project ③
INSERT INTO public.project_items (project_id, category, content, display_order) VALUES
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'done', 'TOP 50 FG 적합도 평가', 1),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'done', '중산·광저우 9개 직접 방문', 2),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'done', '★ 凯瑞达 72점 / 品力 65점 확정', 3),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'done', '여성복 공장 셀렉션 룰 정립', 4),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'blocker', '신규 7개 중 5개 남성복 (FG 부적합)', 1),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'blocker', '여성복: 卡芙瑞 62 / 杰斯特 58 (조건부)', 2),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'next', 'Angel Program 신규 3개 온보딩 (M4-6)', 1),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'next', 'Curvy Breeze 플러스사이즈 보강', 2),
  ('69984614-38a6-44f2-9084-57b8b86c501b', 'next', 'Shein 납품 공장 추가 발굴', 3);

-- ④ Factory Finder 자동화 파이프라인 (was 8단계 자동화 파이프라인)
UPDATE public.projects SET
  number_label = '④',
  name = 'Factory Finder 자동화 파이프라인',
  tag = 'paused',
  progress = 25,
  phase = 'Stage 2-3 (Factory Finder) 부분 구현 · 자동등록 미진행',
  display_order = 4
WHERE id = 'db66a0e0-8ff5-40c7-a5d3-ff6861b23b6d';

-- Remove sales-modeling items from project ④
DELETE FROM public.project_items
WHERE project_id = 'db66a0e0-8ff5-40c7-a5d3-ff6861b23b6d'
  AND content IN (
    'Phase 1~4 수익 모델링',
    '$447B 시장 1% 시나리오',
    'NHN Cloud 인프라 예산 미승인',
    'Phase 2 진입 시 인프라 50-80만/월',
    '테스트 매입 자금 500-1,000만'
  );

-- ⑤ Zhiyitech 검토 (공장 발굴 보조)
UPDATE public.projects SET
  number_label = '⑤',
  name = 'Zhiyitech 검토 (공장 발굴 보조)',
  tag = 'paused',
  progress = 20,
  display_order = 5
WHERE id = '2fb23ef8-da51-4f56-ac5e-55e0d9be8abc';

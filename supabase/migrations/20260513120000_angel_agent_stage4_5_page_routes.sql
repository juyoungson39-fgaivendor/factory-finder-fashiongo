-- ============================================================
-- Angel Agent Stage 4·5 카드 클릭 라우트 정정
-- ============================================================
-- 사유:
--   - Stage 4 (상품 컨펌) 의 page_route 가 /products/sourceable-agent 인데,
--     해당 페이지는 sourceable_products 카탈로그(상품 인벤토리)이지 컨펌 UI 가 아님.
--     실제 컨펌 UI 는 /matches?tab=pending_confirm 에서 작동 중.
--   - Stage 5 (벤더 배분) 의 page_route 가 /ai-vendors 인데,
--     해당 페이지는 벤더 세팅 페이지이지 배분 UI 가 아님.
--     배분 UI 는 (별도 PR 에서) /matches?tab=approved 에 추가 예정.
--
-- 영향:
--   - angel_agent_stages 의 stage_no=4, stage_no=5 두 row 의 page_route 갱신.
--   - 데이터/트리거/RLS 변경 없음. 카드 라우트만 정정.
--
-- 비파괴성:
--   - 다른 stage row 미수정.
--   - 다른 컬럼(name, description, automation_level, status 등) 미수정.
--   - IS DISTINCT FROM 조건으로 멱등 (이미 같은 값이면 no-op).
-- ============================================================

UPDATE public.angel_agent_stages
   SET page_route = '/matches?tab=pending_confirm'
 WHERE stage_no = 4
   AND page_route IS DISTINCT FROM '/matches?tab=pending_confirm';

UPDATE public.angel_agent_stages
   SET page_route = '/matches?tab=approved'
 WHERE stage_no = 5
   AND page_route IS DISTINCT FROM '/matches?tab=approved';

-- PostgREST 스키마 캐시는 컬럼 변경 없으므로 NOTIFY 불필요.
-- (메타데이터 row 갱신만 — 클라이언트 캐시는 React Query refetchInterval=30s 로 자동 동기화)

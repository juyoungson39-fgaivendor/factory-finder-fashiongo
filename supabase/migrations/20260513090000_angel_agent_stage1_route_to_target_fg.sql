-- Stage 1 (트렌드 분석) 카드 클릭 시 이동할 라우트를 타겟상품 페이지로 갱신.
-- 사유: Stage 1 의 산출물(SHEIN/Zara/Amazon 트렌드 → trend_analyses → run_stage2_target_filtering
--      → target_products) 이 타겟상품 페이지에서 확인되므로, 사용자가 카드를 누르면 결과를
--      바로 볼 수 있는 /products/target-fg 로 이동해야 함.
-- 영향: angel_agent_stages 1행의 page_route 컬럼만 갱신. 데이터·트리거·정책 변경 없음.

UPDATE public.angel_agent_stages
   SET page_route = '/products/target-fg'
 WHERE stage_no = 1
   AND page_route IS DISTINCT FROM '/products/target-fg';

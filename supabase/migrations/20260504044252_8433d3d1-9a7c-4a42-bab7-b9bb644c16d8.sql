UPDATE e2e_stages SET
  current_state = 'picks 10개 확정. heimeiren 1건 크롤 OK. SQL 적용·8건 크롤 대기.',
  progress_pct = 35,
  status = 'in_progress'
WHERE stage_no = 1;

DELETE FROM e2e_stage_items WHERE stage_id = (SELECT id FROM e2e_stages WHERE stage_no=1);

INSERT INTO e2e_stage_items (stage_id, kind, content, sort_order)
SELECT s.id,'gap',x.c,x.so FROM e2e_stages s,(VALUES
  ('SQL 미적용 — 10행 박혀야 진행',1),
  ('PENDING 2건 shop_id 추출 필요',2),
  ('자동 크롤 미구현 — 채팅 수동',3),
  ('KPI view 미구축',4)
) x(c,so) WHERE s.stage_no=1;

INSERT INTO e2e_stage_items (stage_id, kind, content, done, sort_order)
SELECT s.id,'action',x.c,x.d,x.so FROM e2e_stages s,(VALUES
  ('dummy 124개 삭제',true,1),
  ('picks 10개 + SQL 작성',true,2),
  ('heimeiren 크롤 검증',true,3),
  ('SQL 적용',false,4),
  ('남은 8건 크롤',false,5),
  ('PENDING 2건 shop_id 추출',false,6),
  ('Edge Function 자동화',false,7),
  ('Angel Agent 재시작',false,8),
  ('KPI view 구축',false,9),
  ('크롤러 안정화',false,10)
) x(c,d,so) WHERE s.stage_no=1;
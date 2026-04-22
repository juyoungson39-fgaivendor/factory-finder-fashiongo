-- 공장 목록을 모든 로그인 사용자가 공유해서 볼 수 있도록 SELECT 정책 변경
-- INSERT/UPDATE/DELETE 정책은 그대로 유지 (본인 것만 수정/삭제 가능)
DROP POLICY IF EXISTS "Users can view own factories" ON public.factories;

CREATE POLICY "Authenticated users can view all factories"
ON public.factories
FOR SELECT
TO authenticated
USING (true);
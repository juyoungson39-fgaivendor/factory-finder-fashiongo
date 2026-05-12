
-- 1A. Grant admin role to user
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = 'hyeryeon.yun@nhn-commerce.com';

-- 1B. is_admin() helper (JWT app_metadata-based)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS '현재 세션 사용자가 admin role 인지 반환';

-- 2. RLS DELETE policy — admin only
DROP POLICY IF EXISTS "trend_analyses_admin_delete" ON public.trend_analyses;

CREATE POLICY "trend_analyses_admin_delete"
ON public.trend_analyses
FOR DELETE
TO authenticated
USING (public.is_admin());

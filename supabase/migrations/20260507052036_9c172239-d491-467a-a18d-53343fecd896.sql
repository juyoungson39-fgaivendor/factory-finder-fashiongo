-- 1. source_note 컬럼 추가
ALTER TABLE public.factories ADD COLUMN IF NOT EXISTS source_note text;

-- 2. 삭제 이력 백업 테이블
CREATE TABLE IF NOT EXISTS public.factories_deleted_log (
  id uuid,
  name text,
  deleted_at timestamptz DEFAULT now(),
  deleted_by uuid,
  reason text
);
ALTER TABLE public.factories_deleted_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_only_factories_deleted_log" ON public.factories_deleted_log;
CREATE POLICY "admins_only_factories_deleted_log" ON public.factories_deleted_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. 깨진 factory 백업 + 삭제
INSERT INTO public.factories_deleted_log (id, name, reason)
SELECT id, name, 'crawler_error_garbage_2026_05'
  FROM public.factories
 WHERE name = 'Looks like there’s a problem with this site';

DELETE FROM public.factories
 WHERE name = 'Looks like there’s a problem with this site';

-- 4. vendor_name → factories 신규 INSERT (master 계정 소유)
INSERT INTO public.factories (name, user_id, shop_id, source_note, status)
SELECT DISTINCT
  BTRIM(sp.vendor_name) AS name,
  '5989122f-c80d-462e-be4f-789e40b5de77'::uuid AS user_id,
  'migrated-' || LOWER(REGEXP_REPLACE(BTRIM(sp.vendor_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(MD5(BTRIM(sp.vendor_name)), 1, 6) AS shop_id,
  'migrated_from_vendor_name_2026_05_07' AS source_note,
  'active' AS status
FROM public.sourceable_products sp
LEFT JOIN public.factories f ON LOWER(BTRIM(f.name)) = LOWER(BTRIM(sp.vendor_name))
WHERE sp.vendor_name IS NOT NULL
  AND BTRIM(sp.vendor_name) <> ''
  AND f.id IS NULL;

-- 5. sourceable_products.factory_id 백필
UPDATE public.sourceable_products sp
   SET factory_id = f.id
  FROM public.factories f
 WHERE LOWER(BTRIM(f.name)) = LOWER(BTRIM(sp.vendor_name))
   AND sp.factory_id IS NULL
   AND sp.vendor_name IS NOT NULL
   AND BTRIM(sp.vendor_name) <> '';
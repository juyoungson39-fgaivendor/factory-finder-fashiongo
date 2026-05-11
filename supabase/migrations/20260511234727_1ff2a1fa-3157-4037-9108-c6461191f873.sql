
-- 1) 기존 candidate row 마이그레이션
UPDATE public.trend_sourceable_matches
SET status = 'pending_confirm'
WHERE status = 'candidate';

-- 2) 새 enum 생성 후 swap (방법 A)
CREATE TYPE public.match_status_v2 AS ENUM (
  'pending_confirm',
  'approved',
  'rejected',
  'active'
);

-- default 일시 제거 (타입 변경 위해)
ALTER TABLE public.trend_sourceable_matches
  ALTER COLUMN status DROP DEFAULT;

-- 컬럼 타입 변환
ALTER TABLE public.trend_sourceable_matches
  ALTER COLUMN status TYPE public.match_status_v2
  USING status::text::public.match_status_v2;

-- default 재설정
ALTER TABLE public.trend_sourceable_matches
  ALTER COLUMN status SET DEFAULT 'pending_confirm';

-- 옛 enum 제거 후 이름 통일
DROP TYPE public.match_status;
ALTER TYPE public.match_status_v2 RENAME TO match_status;

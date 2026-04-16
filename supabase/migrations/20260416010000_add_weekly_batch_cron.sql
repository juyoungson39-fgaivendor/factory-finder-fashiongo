-- ============================================================
-- 주 단위 배치 수집 자동화 — pg_cron + pg_net
-- ============================================================
--
-- ⚠️  Supabase pg_cron 지원 여부:
--   • Pro / Team / Enterprise 플랜: 지원됨
--     → Supabase Dashboard > Database > Extensions에서 pg_cron 활성화 후 이 SQL 실행
--   • Free / Starter 플랜: pg_cron 미지원
--     → 아래 [대안] 방법 사용
--
-- [대안 A] Supabase Dashboard > Database > Cron Jobs > "+ Add Cron Job"
--   Schedule : 0 0 * * 1   (매주 월요일 UTC 00:00 = 한국시간 09:00)
--   Command  :
--     SELECT net.http_post(
--       url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/batch-pipeline',
--       headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY",
--                    "Content-Type":"application/json"}'::jsonb,
--       body    := '{"triggered_by":"scheduled","analyze":true,"embed":true}'::jsonb
--     );
--
-- [대안 B] GitHub Actions / Vercel Cron / 외부 스케줄러에서
--   매주 월요일 09:00 KST에 아래 URL로 POST 호출:
--   POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/batch-pipeline
--   Authorization: Bearer YOUR_SERVICE_ROLE_KEY
--   Body: {"triggered_by":"scheduled","analyze":true,"embed":true}
--
-- ============================================================
-- 사전 설정 (SQL Editor에서 1회 실행):
--   ALTER DATABASE postgres
--     SET "app.settings.supabase_url"      = 'https://YOUR_PROJECT_REF.supabase.co';
--   ALTER DATABASE postgres
--     SET "app.settings.service_role_key"  = 'YOUR_SERVICE_ROLE_KEY';
-- ============================================================

-- pg_cron / pg_net 활성화 (지원 환경에서만 성공)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 기존 동명 스케줄 제거 (幂等성 보장)
DO $remove_old$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-trend-batch') THEN
    PERFORM cron.unschedule('weekly-trend-batch');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron 미지원 환경에서는 무시
  RAISE NOTICE 'pg_cron not available, skipping unschedule: %', SQLERRM;
END;
$remove_old$;

-- 매주 월요일 UTC 00:00 (한국시간 09:00) 배치 파이프라인 실행
DO $schedule$
BEGIN
  PERFORM cron.schedule(
    'weekly-trend-batch',
    '0 0 * * 1',
    $job$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/batch-pipeline',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{"triggered_by":"scheduled","analyze":true,"embed":true}'::jsonb
    );
    $job$
  );
  RAISE NOTICE 'weekly-trend-batch cron job registered successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not register cron job (pg_cron unavailable): %. Use Dashboard > Cron Jobs instead.', SQLERRM;
END;
$schedule$;

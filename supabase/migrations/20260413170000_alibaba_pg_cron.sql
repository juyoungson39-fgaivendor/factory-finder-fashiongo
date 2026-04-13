-- ============================================================================
-- Phase 1.3 — Alibaba integration pg_cron jobs
-- ----------------------------------------------------------------------------
-- Registers two cron jobs:
--   1. alibaba-refresh-token   — every 30 min (HTTP POST via pg_net)
--   2. alibaba-purge-cache     — daily at 03:00 UTC (SQL-only)
--
-- PREREQUISITES (see tech_spec §6 "Deployment ceremony"):
--   1. Phase 1.1 migration applied (supabase_vault + pg_net enabled)
--   2. Edge Functions T001–T011 deployed
--   3. Supabase Secrets set (ALIBABA_* env vars + SUPABASE_SERVICE_ROLE_KEY)
--   4. Vault secrets seeded:
--        SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1/alibaba-refresh-token', 'alibaba_function_url');
--        SELECT vault.create_secret('Bearer <SUPABASE_SERVICE_ROLE_KEY>',                           'alibaba_service_role_bearer');
--   Running this migration BEFORE step 4 will raise the pre-flight exception below.
-- ============================================================================

-- ── Ensure extensions ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── MANDATORY pre-flight check ──────────────────────────────────────────────
-- Fail the migration loudly if Vault secrets are missing (not silently register
-- a broken job). Error code 55000 = object_not_in_prerequisite_state.
DO $$
DECLARE
    v_missing TEXT[];
BEGIN
    SELECT COALESCE(array_agg(expected.name), ARRAY[]::TEXT[])
      INTO v_missing
      FROM (VALUES ('alibaba_function_url'), ('alibaba_service_role_bearer')) AS expected(name)
      LEFT JOIN vault.decrypted_secrets v ON v.name = expected.name
     WHERE v.name IS NULL;

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION
            'Missing Vault secrets: %. Seed them via vault.create_secret(...) first — see migration header comment.',
            v_missing
            USING ERRCODE = '55000';
    END IF;
END$$;

-- ── Schedule alibaba-refresh-token (every 30 minutes) ───────────────────────
DO $$
DECLARE
    v_url     TEXT;
    v_bearer  TEXT;
    v_job_id  BIGINT;
BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'alibaba_function_url';
    SELECT decrypted_secret INTO v_bearer
      FROM vault.decrypted_secrets WHERE name = 'alibaba_service_role_bearer';

    -- Unschedule any prior version of this job so the migration is re-runnable.
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'alibaba-refresh-token';
    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
        'alibaba-refresh-token',
        '*/30 * * * *',  -- every 30 min
        format($job$
            SELECT net.http_post(
                url := %L,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', %L
                ),
                body := '{}'::jsonb,
                timeout_milliseconds := 15000
            );
        $job$, v_url, v_bearer)
    );
END$$;

-- ── Schedule alibaba-purge-cache (daily at 03:00 UTC) ───────────────────────
DO $$
DECLARE
    v_job_id BIGINT;
BEGIN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'alibaba-purge-cache';
    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
        'alibaba-purge-cache',
        '0 3 * * *',  -- daily at 03:00 UTC
        $job$SELECT public.alibaba_purge_expired_cache();$job$
    );
END$$;

-- ── Summary comment for audit ───────────────────────────────────────────────
COMMENT ON EXTENSION pg_cron IS
    'Used by Alibaba integration for refresh-token (30 min) and purge-cache (daily).';

-- ============================================================================
-- End of migration. Verify with:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'alibaba-%';
-- ============================================================================

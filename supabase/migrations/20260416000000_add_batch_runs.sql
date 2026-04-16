-- ============================================================
-- batch_runs 테이블: 배치 수집 파이프라인 실행 이력
-- ============================================================

CREATE TABLE IF NOT EXISTS public.batch_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  triggered_by    text        NOT NULL
                              CHECK (triggered_by IN ('manual', 'scheduled')),
  status          text        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  collected_count int         NOT NULL DEFAULT 0,
  analyzed_count  int         NOT NULL DEFAULT 0,
  embedded_count  int         NOT NULL DEFAULT 0,
  failed_count    int         NOT NULL DEFAULT 0,
  error_log       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 인덱스 ──────────────────────────────────────────────────
-- 최신순 목록 조회 최적화
CREATE INDEX IF NOT EXISTS idx_batch_runs_started_at
  ON public.batch_runs (started_at DESC);

-- 실행 중인 배치 빠른 조회
CREATE INDEX IF NOT EXISTS idx_batch_runs_status
  ON public.batch_runs (status)
  WHERE status = 'running';

-- ── RLS ─────────────────────────────────────────────────────
-- 인증된 사용자는 SELECT만 가능
-- INSERT / UPDATE는 SERVICE_ROLE 키만 가능 (Edge Function이 service_role로 RLS 우회)
ALTER TABLE public.batch_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view batch runs"
  ON public.batch_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT / UPDATE 정책 없음 → authenticated 역할은 쓰기 불가
-- Service Role은 RLS를 우회하므로 별도 정책 불필요

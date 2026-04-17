-- ============================================================
-- sourcing_reports: AI 기반 주간 소싱 추천 리포트 저장
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sourcing_reports (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL,
  period_days  INTEGER      NOT NULL DEFAULT 7,
  report_data  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  summary      TEXT,
  generated_at TIMESTAMPTZ  DEFAULT now(),
  created_at   TIMESTAMPTZ  DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.sourcing_reports ENABLE ROW LEVEL SECURITY;

-- 사용자 본인의 리포트만 조회 가능
CREATE POLICY "Users can view own reports"
  ON public.sourcing_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Service Role (Edge Function)은 모든 작업 가능
CREATE POLICY "Service role can manage"
  ON public.sourcing_reports FOR ALL
  USING (true);

-- ── 인덱스 ──────────────────────────────────────────────────
-- 사용자별 최신 리포트 조회 최적화
CREATE INDEX idx_sourcing_reports_user_date
  ON public.sourcing_reports (user_id, generated_at DESC);

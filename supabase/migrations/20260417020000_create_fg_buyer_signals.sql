-- ============================================================
-- FashionGo 바이어 행동 시그널 저장 테이블
-- ============================================================
-- signal_type 종류:
--   'view'     — 상품/카테고리 조회
--   'click'    — 상품 클릭 (상세 페이지 진입)
--   'wishlist' — 위시리스트 추가
--   'order'    — 주문 발생
--   'search'   — 검색어 입력
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fg_buyer_signals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  signal_type     TEXT        NOT NULL
                              CHECK (signal_type IN ('view', 'click', 'wishlist', 'order', 'search')),
  product_category TEXT,
  keyword         TEXT,
  count           INTEGER     NOT NULL DEFAULT 1,
  signal_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  source_data     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.fg_buyer_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signals"
  ON public.fg_buyer_signals FOR SELECT
  USING (auth.uid() = user_id);

-- Service Role (Edge Function)은 RLS 우회 → 별도 정책 불필요

-- ── 인덱스 ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fg_buyer_signals_date
  ON public.fg_buyer_signals (signal_date DESC, signal_type);

CREATE INDEX IF NOT EXISTS idx_fg_buyer_signals_user
  ON public.fg_buyer_signals (user_id, signal_date DESC);

CREATE INDEX IF NOT EXISTS idx_fg_buyer_signals_category
  ON public.fg_buyer_signals (product_category)
  WHERE product_category IS NOT NULL;

-- ── 집계 뷰: 최근 7일 카테고리별 시그널 합계 ─────────────────
CREATE OR REPLACE VIEW public.fg_signal_category_stats AS
SELECT
  user_id,
  product_category,
  SUM(CASE WHEN signal_type = 'view'     THEN count ELSE 0 END) AS view_count,
  SUM(CASE WHEN signal_type = 'click'    THEN count ELSE 0 END) AS click_count,
  SUM(CASE WHEN signal_type = 'wishlist' THEN count ELSE 0 END) AS wishlist_count,
  SUM(CASE WHEN signal_type = 'order'    THEN count ELSE 0 END) AS order_count,
  SUM(CASE WHEN signal_type = 'search'   THEN count ELSE 0 END) AS search_count,
  SUM(count)                                                      AS total_signals,
  MAX(signal_date)                                                AS last_signal_date
FROM public.fg_buyer_signals
WHERE signal_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id, product_category;

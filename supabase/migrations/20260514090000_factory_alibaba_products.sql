-- ============================================================
-- TABLE: factory_alibaba_products
-- Stores Alibaba product listings scraped from each factory's
-- supplier showroom page. One row per (factory_id, alibaba_product_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.factory_alibaba_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  factory_id            UUID NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,

  -- Alibaba product identifiers
  alibaba_product_id    TEXT NOT NULL,        -- e.g. "1601654906797"
  alibaba_url           TEXT,                  -- product detail URL

  -- Product info (extracted from supplier productlist page)
  title                 TEXT,
  main_image_url        TEXT,
  price_text            TEXT,                  -- raw "US $40.90-46.50" — pre-parse
  price_min             NUMERIC(12, 2),
  price_max             NUMERIC(12, 2),
  currency              TEXT DEFAULT 'USD',
  moq_text              TEXT,                  -- raw "Min. order: 10 sets" — pre-parse
  moq_value             INTEGER,
  moq_unit              TEXT,                  -- "sets", "pieces" etc.

  -- Crawl metadata
  raw_data              JSONB DEFAULT '{}'::jsonb,  -- everything we parsed
  scraped_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_page           TEXT,                  -- which page URL the data came from

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One product per factory (re-crawl updates, not inserts duplicates)
  UNIQUE (factory_id, alibaba_product_id)
);

-- Indexes for the most common query patterns
CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_factory_id
  ON public.factory_alibaba_products (factory_id);

CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_user_id
  ON public.factory_alibaba_products (user_id);

CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_scraped_at
  ON public.factory_alibaba_products (scraped_at DESC);

-- updated_at trigger
CREATE TRIGGER update_factory_alibaba_products_updated_at
  BEFORE UPDATE ON public.factory_alibaba_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — owner-only access
ALTER TABLE public.factory_alibaba_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own factory alibaba products"
  ON public.factory_alibaba_products FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own factory alibaba products"
  ON public.factory_alibaba_products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own factory alibaba products"
  ON public.factory_alibaba_products FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own factory alibaba products"
  ON public.factory_alibaba_products FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- service_role bypasses RLS via vault/RPC writes (used by edge function).

-- ============================================================
-- TABLE: factory_alibaba_crawl_logs
-- Tracks each crawl attempt so we know when a factory was last
-- crawled, success/failure status, and how many products came back.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.factory_alibaba_crawl_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  factory_id        UUID NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,

  status            TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed', 'failed', 'skipped')),
  records_synced    INTEGER NOT NULL DEFAULT 0,
  source_page       TEXT,
  error_message     TEXT,
  duration_ms       INTEGER,

  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_factory_alibaba_crawl_logs_factory_id
  ON public.factory_alibaba_crawl_logs (factory_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_factory_alibaba_crawl_logs_user_id
  ON public.factory_alibaba_crawl_logs (user_id);

ALTER TABLE public.factory_alibaba_crawl_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own factory alibaba crawl logs"
  ON public.factory_alibaba_crawl_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own factory alibaba crawl logs"
  ON public.factory_alibaba_crawl_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own factory alibaba crawl logs"
  ON public.factory_alibaba_crawl_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.factory_alibaba_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  factory_id            UUID NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  alibaba_product_id    TEXT NOT NULL,
  alibaba_url           TEXT,
  title                 TEXT,
  main_image_url        TEXT,
  price_text            TEXT,
  price_min             NUMERIC(12, 2),
  price_max             NUMERIC(12, 2),
  currency              TEXT DEFAULT 'USD',
  moq_text              TEXT,
  moq_value             INTEGER,
  moq_unit              TEXT,
  raw_data              JSONB DEFAULT '{}'::jsonb,
  scraped_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_page           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, alibaba_product_id)
);

CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_factory_id
  ON public.factory_alibaba_products (factory_id);
CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_user_id
  ON public.factory_alibaba_products (user_id);
CREATE INDEX IF NOT EXISTS idx_factory_alibaba_products_scraped_at
  ON public.factory_alibaba_products (scraped_at DESC);

CREATE TRIGGER update_factory_alibaba_products_updated_at
  BEFORE UPDATE ON public.factory_alibaba_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

-- sourcing_products
CREATE TABLE IF NOT EXISTS public.sourcing_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text,
  image_url text,
  tags text[] DEFAULT '{}',
  category text,
  price_cny numeric,
  price_usd_est numeric,
  is_new boolean DEFAULT false,
  is_best boolean DEFAULT false,
  rank_in_factory int,
  source_platform text,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT sourcing_products_factory_external_unique UNIQUE (factory_id, external_id)
);

ALTER TABLE public.sourcing_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sp_authenticated_read" ON public.sourcing_products;
CREATE POLICY "sp_authenticated_read" ON public.sourcing_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sp_service_all" ON public.sourcing_products;
CREATE POLICY "sp_service_all" ON public.sourcing_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sourcing_products_factory ON public.sourcing_products(factory_id);
CREATE INDEX IF NOT EXISTS idx_sourcing_products_tags ON public.sourcing_products USING GIN(tags);

-- e2e_stage_runs
CREATE TABLE IF NOT EXISTS public.e2e_stage_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_no smallint NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}',
  triggered_by uuid
);

ALTER TABLE public.e2e_stage_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "esr_authenticated_read" ON public.e2e_stage_runs;
CREATE POLICY "esr_authenticated_read" ON public.e2e_stage_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "esr_authenticated_insert" ON public.e2e_stage_runs;
CREATE POLICY "esr_authenticated_insert" ON public.e2e_stage_runs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "esr_service_all" ON public.e2e_stage_runs;
CREATE POLICY "esr_service_all" ON public.e2e_stage_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_e2e_stage_runs_started ON public.e2e_stage_runs(started_at DESC);

-- matches: extend
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS sourcing_product_id uuid REFERENCES public.sourcing_products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES public.e2e_stage_runs(run_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_product_id uuid,
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb;

CREATE INDEX IF NOT EXISTS idx_matches_run ON public.matches(run_id);
CREATE INDEX IF NOT EXISTS idx_matches_target_product ON public.matches(target_product_id);
CREATE INDEX IF NOT EXISTS idx_matches_sourcing_product ON public.matches(sourcing_product_id);

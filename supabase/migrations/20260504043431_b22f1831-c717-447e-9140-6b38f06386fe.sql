
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS visited_in_person boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS visit_notes jsonb;

CREATE TABLE IF NOT EXISTS public.manual_crawl_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','failed')),
  failure_reason text,
  resolved_factory_id uuid REFERENCES public.factories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_crawl_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_rw_mcq" ON public.manual_crawl_queue;
CREATE POLICY "public_rw_mcq" ON public.manual_crawl_queue FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_mcq_status ON public.manual_crawl_queue(status);


-- 1. Replace public-rw "true" policies with authenticated-only equivalents
-- dashboard_meta
DROP POLICY IF EXISTS open_read_meta ON public.dashboard_meta;
DROP POLICY IF EXISTS open_write_meta ON public.dashboard_meta;
CREATE POLICY auth_read_meta ON public.dashboard_meta FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_write_meta ON public.dashboard_meta FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- e2e_stages
DROP POLICY IF EXISTS public_rw_e2e_stages ON public.e2e_stages;
CREATE POLICY auth_rw_e2e_stages ON public.e2e_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- e2e_stage_items
DROP POLICY IF EXISTS public_rw_e2e_stage_items ON public.e2e_stage_items;
CREATE POLICY auth_rw_e2e_stage_items ON public.e2e_stage_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- e2e_tracks
DROP POLICY IF EXISTS public_rw_e2e_tracks ON public.e2e_tracks;
CREATE POLICY auth_rw_e2e_tracks ON public.e2e_tracks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- e2e_kpi
DROP POLICY IF EXISTS public_rw_e2e_kpi ON public.e2e_kpi;
CREATE POLICY auth_rw_e2e_kpi ON public.e2e_kpi FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- angel_agent_stages
DROP POLICY IF EXISTS public_rw_aas ON public.angel_agent_stages;
CREATE POLICY auth_rw_aas ON public.angel_agent_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- angel_agent_runs
DROP POLICY IF EXISTS public_rw_aar ON public.angel_agent_runs;
CREATE POLICY auth_rw_aar ON public.angel_agent_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- manual_crawl_queue
DROP POLICY IF EXISTS public_rw_mcq ON public.manual_crawl_queue;
CREATE POLICY auth_rw_mcq ON public.manual_crawl_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- match_feedback
DROP POLICY IF EXISTS "Allow all for match_feedback" ON public.match_feedback;
CREATE POLICY auth_rw_match_feedback ON public.match_feedback FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- matches
DROP POLICY IF EXISTS public_rw_matches ON public.matches;
CREATE POLICY auth_rw_matches ON public.matches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- project_items
DROP POLICY IF EXISTS open_read_items ON public.project_items;
DROP POLICY IF EXISTS open_write_items ON public.project_items;
CREATE POLICY auth_read_items ON public.project_items FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_write_items ON public.project_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- projects
DROP POLICY IF EXISTS open_read_projects ON public.projects;
DROP POLICY IF EXISTS open_write_projects ON public.projects;
CREATE POLICY auth_read_projects ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_write_projects ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- target_products
DROP POLICY IF EXISTS public_rw_target_products ON public.target_products;
CREATE POLICY auth_rw_target_products ON public.target_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- team_members
DROP POLICY IF EXISTS open_read_team_members ON public.team_members;
DROP POLICY IF EXISTS open_write_team_members ON public.team_members;
CREATE POLICY auth_read_team_members ON public.team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_write_team_members ON public.team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Backup tables: enable RLS, no policies (admin/service-role only)
ALTER TABLE public.factories_backup_alibaba_pivot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factories_backup_v3 ENABLE ROW LEVEL SECURITY;

-- 3. trend_analyses: drop over-broad delete
DROP POLICY IF EXISTS trend_analyses_authenticated_delete ON public.trend_analyses;

-- 4. realtime.messages: restrict to authenticated
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS auth_can_subscribe ON realtime.messages';
    EXECUTE 'CREATE POLICY auth_can_subscribe ON realtime.messages FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- 5. Storage: scope products/ uploads to {uid} path segment
DROP POLICY IF EXISTS "Authenticated users can upload product photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload product photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'factory-photos'
    AND (storage.foldername(name))[1] = 'products'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
CREATE POLICY "Authenticated users can update product photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'factory-photos'
    AND (storage.foldername(name))[1] = 'products'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'factory-photos'
    AND (storage.foldername(name))[1] = 'products'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 6. Fix mutable search_path on set_updated_at
ALTER FUNCTION public.set_updated_at() SET search_path = public;

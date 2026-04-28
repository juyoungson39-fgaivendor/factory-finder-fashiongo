CREATE TABLE public.e2e_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_no smallint NOT NULL CHECK (stage_no BETWEEN 1 AND 8),
  week_label text NOT NULL,
  title text NOT NULL,
  current_state text,
  progress_pct smallint DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  status text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked')),
  owner_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  sort_order smallint NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX e2e_stages_stage_no_uk ON public.e2e_stages(stage_no);

CREATE TABLE public.e2e_stage_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.e2e_stages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('gap','action','deliverable')),
  content text NOT NULL,
  done boolean DEFAULT false,
  owner_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX e2e_stage_items_stage_id_idx ON public.e2e_stage_items(stage_id);

CREATE TABLE public.e2e_kpi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text UNIQUE NOT NULL,
  label text NOT NULL,
  target_value numeric NOT NULL,
  current_value numeric DEFAULT 0,
  unit text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('higher_better','lower_better')),
  sort_order smallint NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.e2e_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_stage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2e_kpi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_rw_e2e_stages" ON public.e2e_stages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_rw_e2e_stage_items" ON public.e2e_stage_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_rw_e2e_kpi" ON public.e2e_kpi FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_e2e_stages_upd BEFORE UPDATE ON public.e2e_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_e2e_stage_items_upd BEFORE UPDATE ON public.e2e_stage_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_e2e_kpi_upd BEFORE UPDATE ON public.e2e_kpi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
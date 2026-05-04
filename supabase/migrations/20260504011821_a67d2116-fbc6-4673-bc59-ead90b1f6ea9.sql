ALTER TABLE public.e2e_stages DROP CONSTRAINT IF EXISTS e2e_stages_stage_no_check;
ALTER TABLE public.e2e_stages ADD CONSTRAINT e2e_stages_stage_no_check CHECK (stage_no >= 1 AND stage_no <= 99);
-- 1) Create e2e_tracks
CREATE TABLE public.e2e_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_key text UNIQUE NOT NULL,
  title text NOT NULL,
  owner_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  color text NOT NULL,
  sort_order smallint NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.e2e_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_rw_e2e_tracks" ON public.e2e_tracks
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.e2e_tracks;

-- 2) Add columns to e2e_stages
ALTER TABLE public.e2e_stages
  ADD COLUMN track_id uuid REFERENCES public.e2e_tracks(id) ON DELETE SET NULL,
  ADD COLUMN intra_track_order smallint;

-- 3) Seed tracks
INSERT INTO public.e2e_tracks (track_key, title, color, sort_order) VALUES
  ('factory_db','공장 DB · 스코어링','#3b82f6',1),
  ('trend','트렌드 분석','#a855f7',2),
  ('matching','매칭 · AI 학습','#10b981',3),
  ('channel','등록 변환 (FG/멀티채널)','#f59e0b',4);

-- 4) Map existing stages to tracks
UPDATE public.e2e_stages s
SET track_id = t.id, intra_track_order = m.ord
FROM public.e2e_tracks t,
  (VALUES (1,1),(2,2),(3,3),(4,1),(5,1),(6,2),(7,1),(8,2)) AS m(stage_no, ord)
WHERE s.stage_no = m.stage_no
  AND t.track_key = CASE
    WHEN m.stage_no IN (1,2,3) THEN 'factory_db'
    WHEN m.stage_no = 4         THEN 'trend'
    WHEN m.stage_no IN (5,6)    THEN 'matching'
    WHEN m.stage_no IN (7,8)    THEN 'channel'
  END;
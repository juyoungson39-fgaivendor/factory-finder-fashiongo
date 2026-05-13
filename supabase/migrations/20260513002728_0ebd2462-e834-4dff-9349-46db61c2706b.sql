
-- 1) Table
CREATE TABLE IF NOT EXISTS public.trend_stopwords (
  keyword     TEXT PRIMARY KEY,
  category    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.trend_stopwords IS
  '비패션 트렌드 거부용 스톱워드. trend_analyses INSERT 트리거가 참조.';

CREATE INDEX IF NOT EXISTS idx_trend_stopwords_lower
  ON public.trend_stopwords (lower(keyword));

-- 2) RLS
ALTER TABLE public.trend_stopwords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stopwords_select_authenticated" ON public.trend_stopwords;
CREATE POLICY "stopwords_select_authenticated"
ON public.trend_stopwords FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stopwords_insert_authenticated" ON public.trend_stopwords;
CREATE POLICY "stopwords_insert_authenticated"
ON public.trend_stopwords FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "stopwords_delete_authenticated" ON public.trend_stopwords;
CREATE POLICY "stopwords_delete_authenticated"
ON public.trend_stopwords FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "stopwords_update_authenticated" ON public.trend_stopwords;
CREATE POLICY "stopwords_update_authenticated"
ON public.trend_stopwords FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3) Seed
INSERT INTO public.trend_stopwords (keyword, category) VALUES
  ('gaming','game'), ('game','game'), ('survival','game'),
  ('roguelike','game'), ('esports','game'),
  ('food','food'), ('recipe','food'), ('restaurant','food'),
  ('cooking','food'), ('beverage','food'), ('dining','food'),
  ('tech','tech'), ('crypto','tech'), ('blockchain','tech'),
  ('software','tech'), ('hardware','tech'), ('semiconductor','tech'),
  ('headphone','tech'), ('earphone','tech'),
  ('politics','politics'), ('news','politics'), ('finance','politics'),
  ('economy','politics'), ('election','politics'),
  ('movie','media'), ('film','media'), ('tv','media'),
  ('anime','media'), ('manga','media'), ('sekiro','media'),
  ('skeletor','media'), ('comics','media'), ('marvel','media'), ('dc','media'),
  ('football','sports'), ('baseball','sports'), ('nba','sports'),
  ('mlb','sports'), ('nfl','sports'), ('soccer','sports'),
  ('tennis','sports'), ('golf','sports'),
  ('pop culture','etc')
ON CONFLICT (keyword) DO NOTHING;

-- 4) Trigger function
CREATE OR REPLACE FUNCTION public.reject_non_fashion_trends()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_kw TEXT;
BEGIN
  IF NEW.trend_keywords IS NULL OR cardinality(NEW.trend_keywords) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT k INTO matched_kw
  FROM unnest(NEW.trend_keywords) k
  WHERE EXISTS (
    SELECT 1 FROM public.trend_stopwords s
    WHERE lower(k) = lower(s.keyword)
  )
  LIMIT 1;

  IF matched_kw IS NOT NULL THEN
    RAISE NOTICE
      'Non-fashion trend rejected: source=% keywords=% matched=%',
      NEW.source_platform, NEW.trend_keywords, matched_kw;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reject_non_fashion_trends() IS
  '비패션 스톱워드 매칭 시 trend_analyses INSERT 거부. 스톱워드는 public.trend_stopwords 테이블 참조.';

-- 5) Trigger
DROP TRIGGER IF EXISTS trend_analyses_reject_non_fashion ON public.trend_analyses;
CREATE TRIGGER trend_analyses_reject_non_fashion
BEFORE INSERT ON public.trend_analyses
FOR EACH ROW
EXECUTE FUNCTION public.reject_non_fashion_trends();

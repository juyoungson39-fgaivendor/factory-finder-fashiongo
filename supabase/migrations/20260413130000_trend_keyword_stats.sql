-- 패션 트렌드 키워드 일별 통계 테이블
CREATE TABLE IF NOT EXISTS public.trend_keyword_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  keyword text NOT NULL,
  category text NOT NULL CHECK (category IN ('silhouette', 'material', 'print', 'color', 'style', 'item')),
  stat_date date NOT NULL,
  post_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword, stat_date)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS trend_keyword_stats_user_date_idx
  ON public.trend_keyword_stats (user_id, stat_date DESC);

CREATE INDEX IF NOT EXISTS trend_keyword_stats_keyword_idx
  ON public.trend_keyword_stats (user_id, keyword);

CREATE INDEX IF NOT EXISTS trend_keyword_stats_category_idx
  ON public.trend_keyword_stats (user_id, category);

-- RLS
ALTER TABLE public.trend_keyword_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trend keyword stats"
  ON public.trend_keyword_stats FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trend_keyword_stats_updated_at
  BEFORE UPDATE ON public.trend_keyword_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

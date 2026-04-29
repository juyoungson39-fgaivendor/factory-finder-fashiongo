
-- 1. style_taxonomy
CREATE TABLE IF NOT EXISTS public.style_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  style_tag TEXT NOT NULL,
  style_tag_kr TEXT,
  keywords TEXT[],
  color_hex TEXT,
  icon_emoji TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.style_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read style taxonomy"
  ON public.style_taxonomy FOR SELECT
  USING (true);

CREATE POLICY "Admins manage style taxonomy"
  ON public.style_taxonomy FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.style_taxonomy (category, style_tag, style_tag_kr, keywords, color_hex, icon_emoji) VALUES
('Tops', 'Y2K', '와이투케이', ARRAY['y2k', 'baby tee', 'halter top', 'crop top', 'rhinestone', 'butterfly'], '#ec4899', '🦋'),
('Dresses', 'Bohemian', '보헤미안', ARRAY['boho', 'bohemian', 'maxi dress', 'floral', 'peasant', 'crochet', 'tassel'], '#f59e0b', '🌻'),
('Tops', 'Minimal', '미니멀', ARRAY['minimal', 'clean', 'basic', 'neutral', 'capsule', 'simple', 'understated'], '#6b7280', '◻️'),
('Outerwear', 'Streetwear', '스트릿웨어', ARRAY['streetwear', 'oversized', 'hoodie', 'cargo', 'graphic', 'urban'], '#1f2937', '🔥'),
('Dresses', 'Coastal', '코스탈', ARRAY['coastal', 'linen', 'beach', 'resort', 'nautical', 'vacation', 'summer'], '#0ea5e9', '🌊'),
('Tops', 'Coquette', '코켓', ARRAY['coquette', 'bow', 'ribbon', 'lace', 'pink', 'feminine', 'ballet'], '#f9a8d4', '🎀'),
('Tops', 'Old Money', '올드머니', ARRAY['old money', 'preppy', 'polo', 'yacht', 'blazer', 'classic', 'ralph lauren'], '#166534', '⛳'),
('Dresses', 'Quiet Luxury', '콰이어트 럭셔리', ARRAY['quiet luxury', 'cashmere', 'silk', 'elevated', 'refined', 'muted', 'luxe'], '#92400e', '✨'),
('Tops', 'Cottagecore', '코티지코어', ARRAY['cottagecore', 'prairie', 'puff sleeve', 'gingham', 'embroidered', 'ruffle'], '#65a30d', '🌿'),
('Bottoms', 'Athleisure', '애슬레저', ARRAY['athleisure', 'leggings', 'jogger', 'sporty', 'workout', 'active'], '#7c3aed', '🏃‍♀️');

-- 2. trend_analyses columns
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS signal_score FLOAT;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS platform_count INTEGER;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS signal_factors JSONB;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS velocity FLOAT;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS supply_gap_score FLOAT;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS style_tags TEXT[];
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS primary_category TEXT;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS cluster_id UUID;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS source_followers INTEGER;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS source_engagement JSONB;
ALTER TABLE public.trend_analyses ADD COLUMN IF NOT EXISTS engagement_rate FLOAT;

-- 3. trend_source_profiles
CREATE TABLE IF NOT EXISTS public.trend_source_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_url TEXT,
  followers INTEGER,
  avg_engagement_rate FLOAT,
  total_trends_found INTEGER DEFAULT 0,
  reliability_score FLOAT,
  last_collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, account_name)
);

ALTER TABLE public.trend_source_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read source profiles"
  ON public.trend_source_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages source profiles"
  ON public.trend_source_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. trend_clusters & members
CREATE TABLE IF NOT EXISTS public.trend_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_name TEXT NOT NULL,
  cluster_name_kr TEXT,
  description TEXT,
  representative_image_url TEXT,
  trend_count INTEGER DEFAULT 0,
  platform_count INTEGER DEFAULT 0,
  platforms TEXT[],
  avg_signal_score FLOAT,
  avg_engagement_rate FLOAT,
  weekly_growth_rate FLOAT,
  style_tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.trend_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read clusters"
  ON public.trend_clusters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages clusters"
  ON public.trend_clusters FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.trend_cluster_members (
  cluster_id UUID REFERENCES public.trend_clusters(id) ON DELETE CASCADE,
  trend_id UUID REFERENCES public.trend_analyses(id) ON DELETE CASCADE,
  similarity_score FLOAT,
  PRIMARY KEY (cluster_id, trend_id)
);

ALTER TABLE public.trend_cluster_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cluster members"
  ON public.trend_cluster_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages cluster members"
  ON public.trend_cluster_members FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add cluster FK on trend_analyses (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cluster'
  ) THEN
    ALTER TABLE public.trend_analyses
      ADD CONSTRAINT fk_cluster FOREIGN KEY (cluster_id)
      REFERENCES public.trend_clusters(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. buyer_demand_summary
CREATE TABLE IF NOT EXISTS public.buyer_demand_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE,
  period_end DATE,
  keyword TEXT,
  search_count INTEGER,
  unique_buyers INTEGER,
  avg_price_interest FLOAT,
  related_trend_ids UUID[],
  supply_match_count INTEGER,
  demand_supply_ratio FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.buyer_demand_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read buyer demand"
  ON public.buyer_demand_summary FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages buyer demand"
  ON public.buyer_demand_summary FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. fg_buyer_signals columns
ALTER TABLE public.fg_buyer_signals ADD COLUMN IF NOT EXISTS trend_id UUID;
ALTER TABLE public.fg_buyer_signals ADD COLUMN IF NOT EXISTS search_query TEXT;
ALTER TABLE public.fg_buyer_signals ADD COLUMN IF NOT EXISTS category_interest TEXT;
ALTER TABLE public.fg_buyer_signals ADD COLUMN IF NOT EXISTS price_range JSONB;
ALTER TABLE public.fg_buyer_signals ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trend_analyses_cluster_id ON public.trend_analyses(cluster_id);
CREATE INDEX IF NOT EXISTS idx_trend_analyses_lifecycle ON public.trend_analyses(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_trend_analyses_signal_score ON public.trend_analyses(signal_score DESC);
CREATE INDEX IF NOT EXISTS idx_trend_cluster_members_trend ON public.trend_cluster_members(trend_id);

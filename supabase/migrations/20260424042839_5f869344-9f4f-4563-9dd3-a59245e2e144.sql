CREATE TABLE IF NOT EXISTS public.collection_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT true,
  hashtags TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  category_urls JSONB DEFAULT '[]'::jsonb,
  collect_limit INTEGER DEFAULT 20,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.collection_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read collection_settings"
  ON public.collection_settings FOR SELECT USING (true);

CREATE POLICY "Authenticated users can update collection_settings"
  ON public.collection_settings FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert collection_settings"
  ON public.collection_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.update_collection_settings_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_collection_settings_updated ON public.collection_settings;
CREATE TRIGGER trigger_collection_settings_updated
  BEFORE UPDATE ON public.collection_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_collection_settings_timestamp();

INSERT INTO public.collection_settings (source_type, is_enabled, hashtags, keywords, category_urls, collect_limit) VALUES
('instagram', true,
  ARRAY['FashionForWomen', 'StyleInspo', 'NewArrivals', 'OOTD', 'StreetStyle', 'FashionTrends', 'WomensBoutique', 'OnlineBoutique', 'BoutiqueLife', 'BoutiqueFinds', 'BoutiqueStyle', 'ShopSmall'],
  '{}', '[]'::jsonb, 20),
('tiktok', true,
  ARRAY['FashionForWomen', 'StyleInspo', 'NewArrivals', 'OOTD', 'FashionTok', 'OutfitInspo', 'WomensBoutique', 'OnlineBoutique', 'BoutiqueLife'],
  '{}', '[]'::jsonb, 20),
('magazine', true,
  '{}',
  ARRAY['fashion trends', 'spring collection', 'runway highlights', 'celebrity style'],
  '[]'::jsonb, 20),
('google', true,
  '{}',
  ARRAY['women''s boutique fashion new arrivals', 'online boutique OOTD style inspiration', 'boutique finds women''s clothing 2026', 'shop small boutique fashion trends'],
  '[]'::jsonb, 20),
('amazon', true,
  '{}',
  ARRAY['trending fashion', 'best seller dresses', 'popular womens clothing'],
  '[]'::jsonb, 20),
('pinterest', true,
  '{}',
  ARRAY['fashion trends', 'outfit inspiration', 'summer style 2026', 'minimalist fashion'],
  '[]'::jsonb, 20),
('fashiongo', true,
  '{}', '{}',
  '[
    {"name": "Trending", "url": "https://www.fashiongo.net/trending"},
    {"name": "Best Sellers", "url": "https://www.fashiongo.net/Best-Sellers"},
    {"name": "New Arrivals", "url": "https://www.fashiongo.net/newarrivals"}
  ]'::jsonb, 30),
('shein', true,
  '{}', '{}',
  '[
    {"name": "Best Sellers", "url": "https://us.shein.com/Fashion/Best-Sellers-sc-01327876.html"},
    {"name": "Dresses", "url": "https://us.shein.com/Women-Dresses-c-12472.html"},
    {"name": "Tops", "url": "https://us.shein.com/category/TOPS-sc-008176027.html"},
    {"name": "Clothing", "url": "https://us.shein.com/Clothing-c-2030.html"},
    {"name": "Top Rated", "url": "https://us.shein.com/hotsale/Women-top-rated-sc-003161153.html"}
  ]'::jsonb, 20)
ON CONFLICT (source_type) DO NOTHING;
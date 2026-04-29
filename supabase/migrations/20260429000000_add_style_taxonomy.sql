-- ============================================================
-- style_taxonomy 테이블 생성 + trend_analyses 컬럼 추가
-- ============================================================

-- 1. style_taxonomy 테이블
CREATE TABLE IF NOT EXISTS public.style_taxonomy (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  style_tag   text         NOT NULL UNIQUE,
  category    text         NOT NULL DEFAULT 'Other',
  icon_emoji  text,
  color_hex   text         DEFAULT '#e5e7eb',
  sort_order  integer      DEFAULT 99,
  description text,
  created_at  timestamptz  DEFAULT now()
);

ALTER TABLE public.style_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "style_taxonomy_read_all"
  ON public.style_taxonomy FOR SELECT
  USING (true);

-- 2. trend_analyses 컬럼 추가
ALTER TABLE public.trend_analyses
  ADD COLUMN IF NOT EXISTS primary_category text,
  ADD COLUMN IF NOT EXISTS style_tags       text[] DEFAULT '{}';

-- 3. 시드 데이터 (기본 패션 스타일 태그)
INSERT INTO public.style_taxonomy (style_tag, category, icon_emoji, color_hex, sort_order) VALUES
  ('Coquette',        'Dresses',     '🎀', '#f9a8d4', 1),
  ('Ballet Core',     'Dresses',     '🩰', '#fce7f3', 2),
  ('Cottage Core',    'Dresses',     '🌸', '#bbf7d0', 3),
  ('Y2K',             'Tops',        '✨', '#ddd6fe', 4),
  ('Streetwear',      'Tops',        '🧢', '#d1d5db', 5),
  ('Preppy',          'Tops',        '🎽', '#bfdbfe', 6),
  ('Minimalist',      'Tops',        '⚪', '#e5e7eb', 7),
  ('Office Siren',    'Tops',        '💼', '#cbd5e1', 8),
  ('Coastal Grandma', 'Tops',        '🐚', '#e0f2fe', 9),
  ('Vintage',         'Tops',        '🕰️', '#fef3c7', 10),
  ('Athleisure',      'Bottoms',     '💪', '#a5f3fc', 11),
  ('Western',         'Bottoms',     '🤠', '#fde68a', 12),
  ('Dark Academia',   'Outerwear',   '📚', '#d97706', 13),
  ('Grunge',          'Outerwear',   '🖤', '#9ca3af', 14),
  ('Gorpcore',        'Outerwear',   '⛰️', '#84cc16', 15),
  ('Mob Wife',        'Outerwear',   '💅', '#6b7280', 16),
  ('Quiet Luxury',    'Accessories', '💎', '#e2e8f0', 17),
  ('Boho',            'Accessories', '🌿', '#d4a574', 18)
ON CONFLICT (style_tag) DO NOTHING;

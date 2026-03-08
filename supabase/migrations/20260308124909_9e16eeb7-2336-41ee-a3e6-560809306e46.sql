
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Factories table
CREATE TABLE public.factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  source_url TEXT,
  source_platform TEXT, -- 'alibaba', '1688', 'other'
  country TEXT,
  city TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_wechat TEXT,
  description TEXT,
  main_products TEXT[],
  moq TEXT,
  lead_time TEXT,
  certifications TEXT[],
  scraped_data JSONB DEFAULT '{}'::jsonb,
  overall_score NUMERIC(3,1) DEFAULT 0,
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'sampling', 'approved', 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.factories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own factories" ON public.factories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert factories" ON public.factories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own factories" ON public.factories FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own factories" ON public.factories FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_factories_updated_at
  BEFORE UPDATE ON public.factories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#f59e0b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tags" ON public.tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Factory-Tag junction
CREATE TABLE public.factory_tags (
  factory_id UUID REFERENCES public.factories(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (factory_id, tag_id)
);
ALTER TABLE public.factory_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own factory tags" ON public.factory_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.factories WHERE id = factory_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.factories WHERE id = factory_id AND user_id = auth.uid()));

-- Scoring criteria
CREATE TABLE public.scoring_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  weight NUMERIC(3,1) DEFAULT 1.0,
  max_score INTEGER DEFAULT 10,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scoring_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own criteria" ON public.scoring_criteria FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Factory scores
CREATE TABLE public.factory_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID REFERENCES public.factories(id) ON DELETE CASCADE NOT NULL,
  criteria_id UUID REFERENCES public.scoring_criteria(id) ON DELETE CASCADE NOT NULL,
  score NUMERIC(4,1) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(factory_id, criteria_id)
);
ALTER TABLE public.factory_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own factory scores" ON public.factory_scores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.factories WHERE id = factory_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.factories WHERE id = factory_id AND user_id = auth.uid()));

CREATE TRIGGER update_factory_scores_updated_at
  BEFORE UPDATE ON public.factory_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notes/Activity log
CREATE TABLE public.factory_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID REFERENCES public.factories(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  note_type TEXT DEFAULT 'general', -- 'general', 'meeting', 'sample', 'negotiation', 'quality'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.factory_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notes" ON public.factory_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_factory_notes_updated_at
  BEFORE UPDATE ON public.factory_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Factory photos
CREATE TABLE public.factory_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID REFERENCES public.factories(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  photo_type TEXT DEFAULT 'product', -- 'product', 'factory', 'sample', 'defect'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.factory_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own photos" ON public.factory_photos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket for factory photos
INSERT INTO storage.buckets (id, name, public) VALUES ('factory-photos', 'factory-photos', true);
CREATE POLICY "Authenticated users can upload photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'factory-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Anyone can view factory photos" ON storage.objects FOR SELECT USING (bucket_id = 'factory-photos');
CREATE POLICY "Users can delete own photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'factory-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- FashionGo queue table (for future auto-listing)
CREATE TABLE public.fashiongo_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID REFERENCES public.factories(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'listed', 'failed'
  product_data JSONB DEFAULT '{}'::jsonb,
  min_score_threshold NUMERIC(3,1),
  listed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fashiongo_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own queue" ON public.fashiongo_queue FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_fashiongo_queue_updated_at
  BEFORE UPDATE ON public.fashiongo_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to recalculate factory overall score
CREATE OR REPLACE FUNCTION public.recalculate_factory_score(p_factory_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC;
BEGIN
  SELECT COALESCE(
    SUM(fs.score * sc.weight) / NULLIF(SUM(sc.weight * sc.max_score), 0) * 100,
    0
  ) INTO v_score
  FROM public.factory_scores fs
  JOIN public.scoring_criteria sc ON sc.id = fs.criteria_id
  WHERE fs.factory_id = p_factory_id;
  
  UPDATE public.factories SET overall_score = v_score WHERE id = p_factory_id;
  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Indexes
CREATE INDEX idx_factories_user_id ON public.factories(user_id);
CREATE INDEX idx_factories_status ON public.factories(status);
CREATE INDEX idx_factories_overall_score ON public.factories(overall_score DESC);
CREATE INDEX idx_factory_notes_factory_id ON public.factory_notes(factory_id);
CREATE INDEX idx_factory_photos_factory_id ON public.factory_photos(factory_id);
CREATE INDEX idx_factory_scores_factory_id ON public.factory_scores(factory_id);

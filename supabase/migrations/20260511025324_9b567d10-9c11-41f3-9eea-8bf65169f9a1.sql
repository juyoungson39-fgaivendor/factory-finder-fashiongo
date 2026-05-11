
-- target_products
CREATE TABLE IF NOT EXISTS public.target_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  trend_keywords text[],
  category text,
  style_tags text[],
  price_min_usd numeric,
  price_max_usd numeric,
  moq_max integer,
  reference_image_urls text[],
  text_filters jsonb,
  source text DEFAULT 'manual' CHECK (source IN ('manual','ai_suggested','imported')),
  status text DEFAULT 'active' CHECK (status IN ('draft','active','archived','expired')),
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.target_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_rw_target_products" ON public.target_products;
CREATE POLICY "public_rw_target_products" ON public.target_products FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_tp_upd ON public.target_products;
CREATE TRIGGER trg_tp_upd BEFORE UPDATE ON public.target_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- matches
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid REFERENCES public.target_products(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.sourceable_products(id) ON DELETE CASCADE,
  factory_id uuid REFERENCES public.factories(id) ON DELETE SET NULL,
  total_score numeric NOT NULL,
  breakdown jsonb NOT NULL,
  status text DEFAULT 'candidate' CHECK (status IN ('candidate','pending_confirm','approved','rejected','in_sampling','live')),
  rejection_reason text CHECK (rejection_reason IN ('price_too_high','design_low','category_mismatch','factory_unreliable','other') OR rejection_reason IS NULL),
  vendor_id uuid,
  notes text,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(target_id, product_id)
);
CREATE INDEX IF NOT EXISTS matches_target_idx ON public.matches(target_id);
CREATE INDEX IF NOT EXISTS matches_product_idx ON public.matches(product_id);
CREATE INDEX IF NOT EXISTS matches_factory_idx ON public.matches(factory_id);
CREATE INDEX IF NOT EXISTS matches_status_idx ON public.matches(status);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_rw_matches" ON public.matches;
CREATE POLICY "public_rw_matches" ON public.matches FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_matches_upd ON public.matches;
CREATE TRIGGER trg_matches_upd BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- run_matching RPC (adapted to actual sourceable_products schema: item_name_en/item_name/unit_price_usd; no moq column)
CREATE OR REPLACE FUNCTION public.run_matching(target_uuid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_total integer := 0;
  rec record;
  v_score numeric;
  v_breakdown jsonb;
  v_keyword_hit numeric;
  v_category_match numeric;
  v_price_fit numeric;
  v_moq_fit numeric;
  v_factory_norm numeric;
BEGIN
  FOR rec IN (
    SELECT 
      tp.id AS target_id, tp.trend_keywords, tp.category AS target_cat,
      tp.price_min_usd, tp.price_max_usd, tp.moq_max,
      sp.id AS product_id, sp.item_name_en AS title_en, sp.item_name AS title_cn,
      sp.category AS product_cat, sp.unit_price_usd AS price_usd, sp.factory_id,
      f.stock_score, f.oem_score, f.name AS factory_name
    FROM public.target_products tp
    CROSS JOIN public.sourceable_products sp
    LEFT JOIN public.factories f ON sp.factory_id = f.id
    WHERE tp.status = 'active'
      AND (target_uuid IS NULL OR tp.id = target_uuid)
      AND sp.status = 'active'
  ) LOOP
    v_total := v_total + 1;

    v_keyword_hit := 0;
    IF rec.trend_keywords IS NOT NULL AND array_length(rec.trend_keywords, 1) > 0 THEN
      SELECT COALESCE(SUM(
        CASE WHEN LOWER(COALESCE(rec.title_en,'') || ' ' || COALESCE(rec.title_cn,''))
                  LIKE '%' || LOWER(kw) || '%' THEN 1 ELSE 0 END
      ),0)::numeric / array_length(rec.trend_keywords,1)
      INTO v_keyword_hit
      FROM unnest(rec.trend_keywords) kw;
    END IF;

    v_category_match := CASE
      WHEN rec.target_cat IS NULL OR rec.product_cat IS NULL THEN 0.5
      WHEN LOWER(rec.target_cat) = LOWER(rec.product_cat) THEN 1.0
      WHEN LOWER(rec.product_cat) LIKE '%' || LOWER(rec.target_cat) || '%' THEN 0.7
      ELSE 0
    END;

    v_price_fit := CASE
      WHEN rec.price_usd IS NULL THEN 0.5
      WHEN rec.price_min_usd IS NULL AND rec.price_max_usd IS NULL THEN 0.7
      WHEN rec.price_min_usd IS NOT NULL AND rec.price_usd < rec.price_min_usd THEN 0.3
      WHEN rec.price_max_usd IS NOT NULL AND rec.price_usd > rec.price_max_usd THEN 0.3
      ELSE 1.0
    END;

    -- sourceable_products has no MOQ column; default to neutral
    v_moq_fit := 0.7;

    v_factory_norm := COALESCE(GREATEST(rec.stock_score, rec.oem_score) / 100.0, 0.5);

    v_score := v_keyword_hit*0.30 + v_category_match*0.25 + v_price_fit*0.20 + v_moq_fit*0.15 + v_factory_norm*0.10;

    v_breakdown := jsonb_build_object(
      'keyword', v_keyword_hit,
      'category', v_category_match,
      'price', v_price_fit,
      'moq', v_moq_fit,
      'factory', v_factory_norm,
      'image', null
    );

    IF v_score >= 0.5 THEN
      INSERT INTO public.matches (target_id, product_id, factory_id, total_score, breakdown)
      VALUES (rec.target_id, rec.product_id, rec.factory_id, v_score, v_breakdown)
      ON CONFLICT (target_id, product_id) DO UPDATE
        SET total_score = EXCLUDED.total_score,
            breakdown = EXCLUDED.breakdown,
            updated_at = now();
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'total',v_total,'inserted',v_inserted,'skipped',v_skipped,'threshold',0.5);
END;
$$;

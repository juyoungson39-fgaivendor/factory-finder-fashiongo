
-- Backup table
CREATE TABLE IF NOT EXISTS public.factories_backup_20260511 AS
SELECT * FROM public.factories;

-- B. Add ai_transaction_volume column (0~10 scale, derived from transaction_count)
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS ai_transaction_volume numeric;

-- C. Add ai_price_competitiveness + basis
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS ai_price_competitiveness numeric;
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS ai_price_competitiveness_basis text;

-- B. Helper function: convert transaction_count → 0~10
CREATE OR REPLACE FUNCTION public.compute_ai_transaction_volume(p_count integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_count IS NULL THEN 0
    WHEN p_count >= 500 THEN 10
    WHEN p_count >= 200 THEN 8
    WHEN p_count >= 100 THEN 6
    WHEN p_count >= 50  THEN 4
    WHEN p_count >= 20  THEN 2
    ELSE 1
  END::numeric;
$$;

-- Trigger: keep ai_transaction_volume in sync with transaction_count
CREATE OR REPLACE FUNCTION public.sync_ai_transaction_volume()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ai_transaction_volume := public.compute_ai_transaction_volume(NEW.transaction_count);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ai_transaction_volume ON public.factories;
CREATE TRIGGER trg_sync_ai_transaction_volume
BEFORE INSERT OR UPDATE OF transaction_count ON public.factories
FOR EACH ROW
EXECUTE FUNCTION public.sync_ai_transaction_volume();

-- Backfill existing rows
UPDATE public.factories
SET ai_transaction_volume = public.compute_ai_transaction_volume(transaction_count);

-- C. Compute ai_price_competitiveness for one factory
CREATE OR REPLACE FUNCTION public.compute_factory_price_competitiveness(p_factory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_category text;
  v_factory_avg numeric;
  v_target_avg numeric;
  v_ratio numeric;
  v_base numeric;
  v_vol_addon numeric := 1.5;
  v_vol_ratio numeric;
  v_vol_count integer;
  v_final numeric;
  v_basis text;
  v_vol_text text;
BEGIN
  -- Determine factory's dominant category from its sourcing_products
  SELECT category INTO v_category
  FROM public.sourcing_products
  WHERE factory_id = p_factory_id AND category IS NOT NULL
  GROUP BY category
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_category IS NULL THEN
    RETURN jsonb_build_object('score', 5, 'basis', '카테고리 정보 없음 — 기본값 5/10');
  END IF;

  -- Factory's avg price (USD) for that category (use price_usd_est, else cny*0.137*1.5)
  SELECT AVG(COALESCE(
    price_usd_est,
    price_cny * 0.137 * 1.5
  ))
  INTO v_factory_avg
  FROM public.sourcing_products
  WHERE factory_id = p_factory_id
    AND category = v_category
    AND COALESCE(price_usd_est, price_cny) IS NOT NULL;

  -- Target_products avg for that category (case-insensitive)
  SELECT AVG((COALESCE(price_min_usd,0) + COALESCE(price_max_usd, price_min_usd, 0))/2.0)
  INTO v_target_avg
  FROM public.target_products
  WHERE LOWER(category) = LOWER(v_category)
    AND status = 'active'
    AND (price_min_usd IS NOT NULL OR price_max_usd IS NOT NULL);

  IF v_factory_avg IS NULL OR v_target_avg IS NULL OR v_target_avg = 0 THEN
    RETURN jsonb_build_object('score', 5, 'basis',
      format('카테고리 %s 비교 데이터 부족 — 기본값 5/10', v_category));
  END IF;

  v_ratio := v_factory_avg / v_target_avg;
  v_base := CASE
    WHEN v_ratio < 0.7  THEN 7
    WHEN v_ratio < 0.9  THEN 6
    WHEN v_ratio < 1.1  THEN 4
    WHEN v_ratio < 1.3  THEN 2
    ELSE 1
  END;

  -- Volume discount: parse "10pc:$X | 30pc:$Y" patterns from title
  SELECT
    AVG(
      (regexp_match(title, '30pc[:\s]*\$?([0-9]+(?:\.[0-9]+)?)', 'i'))[1]::numeric
      / NULLIF((regexp_match(title, '10pc[:\s]*\$?([0-9]+(?:\.[0-9]+)?)', 'i'))[1]::numeric, 0)
    ),
    COUNT(*)
  INTO v_vol_ratio, v_vol_count
  FROM public.sourcing_products
  WHERE factory_id = p_factory_id
    AND title ~* '10pc.*30pc';

  IF v_vol_ratio IS NOT NULL THEN
    v_vol_addon := CASE
      WHEN v_vol_ratio < 0.85 THEN 3
      WHEN v_vol_ratio < 0.92 THEN 2
      WHEN v_vol_ratio < 0.97 THEN 1
      ELSE 0
    END;
    v_vol_text := format('30pc 디스카운트 비율 %s%% (+%s점)',
      ROUND((1 - v_vol_ratio) * 100, 1), v_vol_addon);
  ELSE
    v_vol_text := '디스카운트 정보 없음 (+1.5점)';
  END IF;

  v_final := LEAST(10, v_base + v_vol_addon);

  v_basis := format(
    '카테고리 %s 평균 $%s 대비 이 공장 $%s (%s%%, %s점) + %s = %s/10',
    v_category,
    ROUND(v_target_avg, 2),
    ROUND(v_factory_avg, 2),
    ROUND((v_factory_avg / v_target_avg - 1) * 100, 1),
    v_base,
    v_vol_text,
    v_final
  );

  RETURN jsonb_build_object('score', v_final, 'basis', v_basis);
END;
$$;

-- C. Backfill all factories
DO $$
DECLARE
  r record;
  res jsonb;
BEGIN
  FOR r IN SELECT id FROM public.factories WHERE deleted_at IS NULL LOOP
    res := public.compute_factory_price_competitiveness(r.id);
    UPDATE public.factories
      SET ai_price_competitiveness = (res->>'score')::numeric,
          ai_price_competitiveness_basis = res->>'basis'
      WHERE id = r.id;
  END LOOP;
END $$;

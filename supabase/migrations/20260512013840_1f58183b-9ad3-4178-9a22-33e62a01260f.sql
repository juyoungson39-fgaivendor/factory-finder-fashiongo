CREATE OR REPLACE FUNCTION public.compute_factory_price_competitiveness(p_factory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_category text;
  v_factory_avg numeric;
  v_target_avg numeric;
  v_target_count integer;
  v_factory_count integer;
  v_ratio numeric;
  v_base numeric;
  v_vol_addon numeric := 1.5;
  v_vol_ratio numeric;
  v_final numeric;
  v_basis text;
  v_vol_text text;
BEGIN
  -- Determine factory's dominant category from sourcing_products, fallback to fg_category / raw_main_category
  SELECT category INTO v_category
  FROM public.sourcing_products
  WHERE factory_id = p_factory_id AND category IS NOT NULL
  GROUP BY category
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_category IS NULL THEN
    SELECT COALESCE(NULLIF(fg_category,''), NULLIF(raw_main_category,''))
    INTO v_category FROM public.factories WHERE id = p_factory_id;
  END IF;

  -- Factory's avg price (USD)
  SELECT
    AVG(COALESCE(price_usd_est, price_cny * 0.137 * 1.5)),
    COUNT(*) FILTER (WHERE COALESCE(price_usd_est, price_cny) IS NOT NULL)
  INTO v_factory_avg, v_factory_count
  FROM public.sourcing_products
  WHERE factory_id = p_factory_id
    AND (v_category IS NULL OR category = v_category);

  -- Honest "no data" path: factory has no sourcing prices → return NULL score
  IF v_factory_count IS NULL OR v_factory_count = 0 THEN
    RETURN jsonb_build_object(
      'score', NULL,
      'basis', '공장 가격 데이터(sourcing_products) 미수집 — 산출 불가'
    );
  END IF;

  -- Target avg for category (case-insensitive, draft+active)
  SELECT
    AVG((COALESCE(price_min_usd,0) + COALESCE(price_max_usd, price_min_usd, 0))/2.0),
    COUNT(*) FILTER (WHERE price_min_usd IS NOT NULL OR price_max_usd IS NOT NULL)
  INTO v_target_avg, v_target_count
  FROM public.target_products
  WHERE LOWER(category) = LOWER(v_category)
    AND status IN ('active','draft')
    AND (price_min_usd IS NOT NULL OR price_max_usd IS NOT NULL);

  IF v_target_avg IS NULL OR v_target_avg = 0 OR v_target_count = 0 THEN
    RETURN jsonb_build_object(
      'score', NULL,
      'basis', format('카테고리 %s 타겟 가격 데이터 없음 — 산출 불가', v_category)
    );
  END IF;

  v_ratio := v_factory_avg / v_target_avg;
  v_base := CASE
    WHEN v_ratio < 0.7  THEN 7
    WHEN v_ratio < 0.9  THEN 6
    WHEN v_ratio < 1.1  THEN 4
    WHEN v_ratio < 1.3  THEN 2
    ELSE 1
  END;

  SELECT AVG(
    (regexp_match(title, '30pc[:\s]*\$?([0-9]+(?:\.[0-9]+)?)', 'i'))[1]::numeric
    / NULLIF((regexp_match(title, '10pc[:\s]*\$?([0-9]+(?:\.[0-9]+)?)', 'i'))[1]::numeric, 0)
  )
  INTO v_vol_ratio
  FROM public.sourcing_products
  WHERE factory_id = p_factory_id AND title ~* '10pc.*30pc';

  IF v_vol_ratio IS NOT NULL THEN
    v_vol_addon := CASE
      WHEN v_vol_ratio < 0.85 THEN 3
      WHEN v_vol_ratio < 0.92 THEN 2
      WHEN v_vol_ratio < 0.97 THEN 1
      ELSE 0
    END;
    v_vol_text := format('30pc 디스카운트 %s%% (+%s점)', ROUND((1 - v_vol_ratio) * 100, 1), v_vol_addon);
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
$function$;

-- Recompute for all non-deleted factories so values reflect new "honest null" logic
UPDATE public.factories f
SET ai_price_competitiveness = (public.compute_factory_price_competitiveness(f.id)->>'score')::numeric,
    ai_price_competitiveness_basis = public.compute_factory_price_competitiveness(f.id)->>'basis'
WHERE deleted_at IS NULL;
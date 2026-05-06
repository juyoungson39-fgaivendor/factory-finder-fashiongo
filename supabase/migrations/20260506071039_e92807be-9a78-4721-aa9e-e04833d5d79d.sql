
-- ============================================================
-- A: 매칭 RPC에 attr_sim 추가 (스켈레톤; 비전 데이터 0%여도 안전)
-- B: source 표준화 + CHECK + 백필
-- C: 운영자 감사 로그 컬럼 + BEFORE UPDATE 트리거
-- ============================================================

-- ── B-1. source 표준화 + 백필 ────────────────────────────
UPDATE public.sourceable_products
   SET source = CASE
     WHEN status = 'archived' AND image_embedding IS NULL THEN 'seed'
     WHEN status = 'active'  AND vendor_name IS NOT NULL  THEN 'agent_auto'
     ELSE 'csv_upload'
   END
 WHERE source IS NULL OR source NOT IN ('agent_auto','csv_upload','manual','seed');

ALTER TABLE public.sourceable_products
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.sourceable_products
  DROP CONSTRAINT IF EXISTS sourceable_products_source_check;
ALTER TABLE public.sourceable_products
  ADD CONSTRAINT sourceable_products_source_check
  CHECK (source IN ('agent_auto','csv_upload','manual','seed'));

-- ── C-1. 운영자 감사 로그 컬럼 ──────────────────────────
ALTER TABLE public.sourceable_products
  ADD COLUMN IF NOT EXISTS operator_first_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS operator_first_registered_by uuid,
  ADD COLUMN IF NOT EXISTS operator_last_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS operator_last_modified_by uuid;

-- C-2. 트리거 함수: service_role(자동) vs authenticated(운영자) 구분
CREATE OR REPLACE FUNCTION public.audit_sourceable_products_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 인증된 운영자(JWT role=authenticated)일 때만 마킹.
  -- service_role / anon / 트리거-내 PERFORM 은 모두 skip.
  IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
    IF NEW.operator_first_registered_at IS NULL THEN
      NEW.operator_first_registered_at := now();
      NEW.operator_first_registered_by := auth.uid();
    END IF;
    NEW.operator_last_modified_at := now();
    NEW.operator_last_modified_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_sourceable_products_operator ON public.sourceable_products;
CREATE TRIGGER trg_audit_sourceable_products_operator
BEFORE UPDATE ON public.sourceable_products
FOR EACH ROW
EXECUTE FUNCTION public.audit_sourceable_products_operator();

-- ── A-2. match_sourceable_products_hybrid 재정의 (attr_sim 추가) ──
-- 기존 함수는 같은 시그니처가 아니므로 DROP 후 재생성
DROP FUNCTION IF EXISTS public.match_sourceable_products_hybrid(vector, vector, double precision, integer, double precision, double precision);

CREATE OR REPLACE FUNCTION public.match_sourceable_products_hybrid(
  query_text_embedding   vector,
  query_image_embedding  vector            DEFAULT NULL,
  match_threshold        double precision  DEFAULT 0.40,
  max_results            integer           DEFAULT 20,
  w_text                 double precision  DEFAULT 0.4,
  w_image                double precision  DEFAULT 0.4,
  w_attr                 double precision  DEFAULT 0.2,
  query_attribute_keywords text[]          DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  item_name text,
  item_name_en text,
  vendor_name text,
  category text,
  image_url text,
  unit_price numeric,
  unit_price_usd numeric,
  factory_id uuid,
  text_sim double precision,
  image_sim double precision,
  attr_sim double precision,
  matched_attributes text[],
  final_score double precision,
  used_signals text[]
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm_query AS (
    SELECT CASE
      WHEN query_attribute_keywords IS NULL THEN NULL::text[]
      ELSE (
        SELECT array_agg(DISTINCT lower(btrim(k)))
        FROM unnest(query_attribute_keywords) AS k
        WHERE k IS NOT NULL AND length(btrim(k)) > 0
      )
    END AS qkw
  ),
  prod_attrs AS (
    SELECT sp.id,
      (
        SELECT array_agg(DISTINCT lower(btrim(a)))
        FROM unnest(
          COALESCE(sp.detected_colors, ARRAY[]::text[])
          || CASE WHEN sp.detected_style    IS NOT NULL THEN ARRAY[sp.detected_style]    ELSE ARRAY[]::text[] END
          || CASE WHEN sp.detected_material IS NOT NULL THEN ARRAY[sp.detected_material] ELSE ARRAY[]::text[] END
        ) AS a
        WHERE a IS NOT NULL AND length(btrim(a)) > 0
      ) AS pattrs
    FROM public.sourceable_products sp
    WHERE sp.status = 'active'
  ),
  scored AS (
    SELECT
      sp.id, sp.item_name, sp.item_name_en, sp.vendor_name, sp.category,
      sp.image_url, sp.unit_price, sp.unit_price_usd, sp.factory_id,
      CASE WHEN sp.embedding IS NOT NULL AND query_text_embedding IS NOT NULL
        THEN (1 - (sp.embedding <=> query_text_embedding))::float8 END AS text_sim,
      CASE WHEN sp.image_embedding IS NOT NULL AND query_image_embedding IS NOT NULL
        THEN (1 - (sp.image_embedding <=> query_image_embedding))::float8 END AS image_sim,
      pa.pattrs,
      (SELECT qkw FROM norm_query) AS qkw
    FROM public.sourceable_products sp
    LEFT JOIN prod_attrs pa ON pa.id = sp.id
    WHERE sp.status = 'active'
      AND (sp.embedding IS NOT NULL OR sp.image_embedding IS NOT NULL)
  ),
  attr_calc AS (
    SELECT s.*,
      CASE
        WHEN qkw IS NULL OR array_length(qkw,1) IS NULL THEN NULL
        WHEN pattrs IS NULL OR array_length(pattrs,1) IS NULL THEN 0::float8
        ELSE (
          SELECT COUNT(*)::float8 FROM (
            SELECT unnest(qkw) INTERSECT SELECT unnest(pattrs)
          ) x
        ) / GREATEST(array_length(qkw,1)::float8, 1)
      END AS attr_sim_v,
      CASE
        WHEN qkw IS NULL OR pattrs IS NULL THEN ARRAY[]::text[]
        ELSE ARRAY(SELECT unnest(qkw) INTERSECT SELECT unnest(pattrs))
      END AS matched_attrs_v
    FROM scored s
  ),
  weighted AS (
    SELECT a.*,
      (
        COALESCE(w_text  * text_sim,  0)
      + COALESCE(w_image * image_sim, 0)
      + COALESCE(w_attr  * attr_sim_v, 0)
      ) / NULLIF(
          (CASE WHEN text_sim   IS NOT NULL THEN w_text  ELSE 0 END)
        + (CASE WHEN image_sim  IS NOT NULL THEN w_image ELSE 0 END)
        + (CASE WHEN attr_sim_v IS NOT NULL AND array_length(matched_attrs_v,1) > 0 THEN w_attr ELSE 0 END)
        , 0
      ) AS final_score_v,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN text_sim   IS NOT NULL THEN 'text'  END,
        CASE WHEN image_sim  IS NOT NULL THEN 'image' END,
        CASE WHEN attr_sim_v IS NOT NULL AND array_length(matched_attrs_v,1) > 0 THEN 'attr' END
      ], NULL) AS used_signals_v
    FROM attr_calc a
  )
  SELECT id, item_name, item_name_en, vendor_name, category,
         image_url, unit_price, unit_price_usd, factory_id,
         text_sim, image_sim, attr_sim_v, matched_attrs_v,
         final_score_v, used_signals_v
  FROM weighted
  WHERE final_score_v IS NOT NULL AND final_score_v >= match_threshold
  ORDER BY final_score_v DESC
  LIMIT max_results;
$$;

CREATE OR REPLACE FUNCTION public.match_sourceable_products_hybrid(
  query_text_embedding vector,
  query_image_embedding vector DEFAULT NULL::vector,
  match_threshold double precision DEFAULT 0.40,
  max_results integer DEFAULT 20,
  w_text double precision DEFAULT 0.4,
  w_image double precision DEFAULT 0.4,
  w_attr double precision DEFAULT 0.2,
  query_attribute_keywords text[] DEFAULT NULL::text[]
)
RETURNS TABLE(id uuid, item_name text, item_name_en text, vendor_name text, category text, image_url text, unit_price numeric, unit_price_usd numeric, factory_id uuid, text_sim double precision, image_sim double precision, attr_sim double precision, matched_attributes text[], final_score double precision, used_signals text[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  -- Tokenize: split on space/hyphen/comma/slash, lowercase, drop stopwords & short tokens
  tokenize_q AS (
    SELECT CASE
      WHEN query_attribute_keywords IS NULL THEN NULL::text[]
      ELSE (
        SELECT array_agg(DISTINCT t) FROM (
          SELECT btrim(lower(unnest(regexp_split_to_array(k, '[\s\-,/]+')))) AS t
          FROM unnest(query_attribute_keywords) k
          WHERE k IS NOT NULL
        ) s
        WHERE t IS NOT NULL
          AND length(t) >= 3
          AND t NOT IN ('the','and','for','with','from','your','our','this','that','are','was','were','any','all','new','old','top')
      )
    END AS qtok_raw
  ),
  -- Apply synonym expansion (one direction; we'll also expand product side)
  norm_query AS (
    SELECT CASE
      WHEN qtok_raw IS NULL THEN NULL::text[]
      ELSE (
        SELECT array_agg(DISTINCT s) FROM (
          SELECT unnest(qtok_raw) AS s
          UNION
          SELECT CASE t
            WHEN 'trousers' THEN 'pants'
            WHEN 'pant' THEN 'pants'
            WHEN 'pants' THEN 'trousers'
            WHEN 'shirt' THEN 'top'
            WHEN 'tee' THEN 't-shirt'
            WHEN 'tshirt' THEN 't-shirt'
            WHEN 'jumper' THEN 'sweater'
            WHEN 'pullover' THEN 'sweater'
            WHEN 'sweatshirt' THEN 'hoodie'
            WHEN 'jeans' THEN 'denim'
            WHEN 'denim' THEN 'jeans'
            WHEN 'frock' THEN 'dress'
            WHEN 'gown' THEN 'dress'
            WHEN 'jacket' THEN 'blazer'
            WHEN 'blazer' THEN 'jacket'
            WHEN 'cardigan' THEN 'sweater'
            WHEN 'cream' THEN 'beige'
            WHEN 'ivory' THEN 'white'
            WHEN 'navy' THEN 'blue'
            WHEN 'maroon' THEN 'red'
            WHEN 'burgundy' THEN 'red'
            ELSE NULL
          END FROM unnest(qtok_raw) t
        ) z WHERE s IS NOT NULL
      )
    END AS qkw
    FROM tokenize_q
  ),
  -- Tokenize product attributes the same way
  prod_attrs AS (
    SELECT sp.id,
      (
        SELECT array_agg(DISTINCT t) FROM (
          SELECT btrim(lower(unnest(regexp_split_to_array(a, '[\s\-,/]+')))) AS t
          FROM unnest(
            COALESCE(sp.detected_colors, ARRAY[]::text[])
            || CASE WHEN sp.detected_style    IS NOT NULL THEN ARRAY[sp.detected_style]    ELSE ARRAY[]::text[] END
            || CASE WHEN sp.detected_material IS NOT NULL THEN ARRAY[sp.detected_material] ELSE ARRAY[]::text[] END
          ) a
          WHERE a IS NOT NULL
        ) s
        WHERE t IS NOT NULL AND length(t) >= 3
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
$function$;
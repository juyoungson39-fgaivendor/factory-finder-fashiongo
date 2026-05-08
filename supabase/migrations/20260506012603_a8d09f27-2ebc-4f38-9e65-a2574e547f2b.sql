-- 1) Lower default threshold for match_sourceable_products
CREATE OR REPLACE FUNCTION public.match_sourceable_products(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.40,
  match_count integer DEFAULT 10
)
RETURNS TABLE(id uuid, item_name text, item_name_en text, vendor_name text, category text, image_url text, unit_price numeric, unit_price_usd numeric, factory_id uuid, similarity double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT sp.id, sp.item_name, sp.item_name_en, sp.vendor_name, sp.category,
    sp.image_url, sp.unit_price, sp.unit_price_usd, sp.factory_id,
    (1 - (sp.embedding <=> query_embedding))::float AS similarity
  FROM public.sourceable_products sp
  WHERE sp.embedding IS NOT NULL AND sp.status = 'active'
    AND (1 - (sp.embedding <=> query_embedding)) >= match_threshold
  ORDER BY sp.embedding <=> query_embedding
  LIMIT match_count;
$function$;

-- 2) Auto-embed trigger: async invoke backfill fn via pg_net for new inserts with NULL embedding
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_autofill_sourceable_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  IF NEW.embedding IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Project URL/anon key (public values are fine for invoking edge fn)
  v_url := 'https://muavrctuayyvfzgaygmu.supabase.co/functions/v1/backfill-sourceable-text-embedding';
  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11YXZyY3R1YXl5dmZ6Z2F5Z211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDkxODcsImV4cCI6MjA4OTUyNTE4N30.luuzdH9jJ1qbCp-97YN0aQuYLotFOzMqeckbCWAx_f4';

  -- Fire-and-forget: pg_net is non-blocking
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('batch_size', 5)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block insert on embedding failure
  RAISE WARNING 'autofill embedding trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autofill_sourceable_embedding ON public.sourceable_products;
CREATE TRIGGER trg_autofill_sourceable_embedding
AFTER INSERT ON public.sourceable_products
FOR EACH ROW
EXECUTE FUNCTION public.trigger_autofill_sourceable_embedding();
-- Sync trigger to keep CNY/USD consistent on sourceable_products
CREATE OR REPLACE FUNCTION public.sync_price_cny_usd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_rate numeric;
BEGIN
  IF NEW.unit_price_cny IS NULL AND NEW.unit_price_usd IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cny_to_usd_rate INTO current_rate FROM public.system_settings WHERE id = 1;
  IF current_rate IS NULL OR current_rate = 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.unit_price_cny IS NOT NULL AND NEW.unit_price_usd IS NULL THEN
      NEW.unit_price_usd := ROUND(NEW.unit_price_cny * current_rate, 2);
    ELSIF NEW.unit_price_usd IS NOT NULL AND NEW.unit_price_cny IS NULL THEN
      NEW.unit_price_cny := ROUND(NEW.unit_price_usd / current_rate, 2);
    END IF;
    IF NEW.exchange_rate_at_import IS NULL THEN
      NEW.exchange_rate_at_import := current_rate;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.unit_price_cny IS DISTINCT FROM OLD.unit_price_cny
     AND NEW.unit_price_usd IS NOT DISTINCT FROM OLD.unit_price_usd THEN
    NEW.unit_price_usd := CASE WHEN NEW.unit_price_cny IS NULL THEN NULL
                               ELSE ROUND(NEW.unit_price_cny * current_rate, 2) END;
  ELSIF NEW.unit_price_usd IS DISTINCT FROM OLD.unit_price_usd
        AND NEW.unit_price_cny IS NOT DISTINCT FROM OLD.unit_price_cny THEN
    NEW.unit_price_cny := CASE WHEN NEW.unit_price_usd IS NULL THEN NULL
                               ELSE ROUND(NEW.unit_price_usd / current_rate, 2) END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_price_cny_usd ON public.sourceable_products;
CREATE TRIGGER trg_sync_price_cny_usd
  BEFORE INSERT OR UPDATE ON public.sourceable_products
  FOR EACH ROW EXECUTE FUNCTION public.sync_price_cny_usd();
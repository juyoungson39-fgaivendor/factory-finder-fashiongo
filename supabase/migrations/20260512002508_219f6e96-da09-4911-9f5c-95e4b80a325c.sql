
ALTER TABLE public.factories_backup_20260511 ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.compute_ai_transaction_volume(p_count integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.sync_ai_transaction_volume()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.ai_transaction_volume := public.compute_ai_transaction_volume(NEW.transaction_count);
  RETURN NEW;
END;
$$;

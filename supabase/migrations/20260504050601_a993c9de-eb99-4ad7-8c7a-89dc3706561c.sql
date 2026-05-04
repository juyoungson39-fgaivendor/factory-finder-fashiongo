WITH deleted AS (
  DELETE FROM public.factories
  WHERE shop_id IS NULL
  RETURNING id
)
SELECT COUNT(*) AS deleted_count FROM deleted;
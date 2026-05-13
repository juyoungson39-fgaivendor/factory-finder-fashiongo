-- 1) Drop admin-only DELETE policy
DROP POLICY IF EXISTS "trend_analyses_admin_delete" ON trend_analyses;

-- 2) New authenticated DELETE policy
DROP POLICY IF EXISTS "trend_analyses_authenticated_delete" ON trend_analyses;
CREATE POLICY "trend_analyses_authenticated_delete"
ON trend_analyses
FOR DELETE
TO authenticated
USING (true);

-- 3) target_products FK CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'target_products'::regclass
      AND conname = 'target_products_trend_analysis_id_fkey'
  ) THEN
    ALTER TABLE target_products
      DROP CONSTRAINT target_products_trend_analysis_id_fkey;
  END IF;
END $$;

ALTER TABLE target_products
  ADD CONSTRAINT target_products_trend_analysis_id_fkey
  FOREIGN KEY (trend_analysis_id)
  REFERENCES trend_analyses(id)
  ON DELETE CASCADE;
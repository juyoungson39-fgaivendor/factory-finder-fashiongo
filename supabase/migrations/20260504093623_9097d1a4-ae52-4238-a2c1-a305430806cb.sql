DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='factories' AND column_name='shop_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE factories ALTER COLUMN shop_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='factories_shop_id_not_empty'
  ) THEN
    ALTER TABLE factories
      ADD CONSTRAINT factories_shop_id_not_empty
      CHECK (shop_id <> '' AND shop_id !~ '^\s+$');
  END IF;
END $$;
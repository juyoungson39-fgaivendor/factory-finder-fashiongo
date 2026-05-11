-- Connections
CREATE TABLE IF NOT EXISTS public.alibaba_shop_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL,
  shop_id text NOT NULL,
  shop_name text,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'active',
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  vault_secret_name text NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, shop_id)
);
CREATE INDEX IF NOT EXISTS idx_ali_conn_user ON public.alibaba_shop_connections(user_id);

-- Products
CREATE TABLE IF NOT EXISTS public.alibaba_synced_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  title text,
  image_url text,
  price_min numeric,
  price_max numeric,
  currency text DEFAULT 'USD',
  moq integer,
  category text,
  status text,
  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_product_id, connection_id)
);
CREATE INDEX IF NOT EXISTS idx_ali_prod_conn ON public.alibaba_synced_products(connection_id);
CREATE INDEX IF NOT EXISTS idx_ali_prod_user ON public.alibaba_synced_products(user_id);

-- Orders
CREATE TABLE IF NOT EXISTS public.alibaba_synced_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  external_order_id text NOT NULL,
  order_status text,
  total_amount numeric,
  currency text DEFAULT 'USD',
  buyer_name text,
  item_count integer,
  ordered_at timestamptz,
  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_order_id, connection_id)
);
CREATE INDEX IF NOT EXISTS idx_ali_ord_conn ON public.alibaba_synced_orders(connection_id);
CREATE INDEX IF NOT EXISTS idx_ali_ord_user ON public.alibaba_synced_orders(user_id);

-- Inventory
CREATE TABLE IF NOT EXISTS public.alibaba_synced_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  sku text,
  warehouse text,
  quantity integer NOT NULL DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_product_id, connection_id)
);
CREATE INDEX IF NOT EXISTS idx_ali_inv_conn ON public.alibaba_synced_inventory(connection_id);
CREATE INDEX IF NOT EXISTS idx_ali_inv_user ON public.alibaba_synced_inventory(user_id);

-- Sync logs
CREATE TABLE IF NOT EXISTS public.alibaba_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  records_synced integer NOT NULL DEFAULT 0,
  last_page integer,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ali_log_conn ON public.alibaba_sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_ali_log_status ON public.alibaba_sync_logs(connection_id, status);

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alibaba_shop_connections','alibaba_synced_products','alibaba_synced_orders','alibaba_synced_inventory','alibaba_sync_logs']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.alibaba_shop_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alibaba_synced_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alibaba_synced_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alibaba_synced_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alibaba_sync_logs        ENABLE ROW LEVEL SECURITY;

-- Owner-only RLS policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alibaba_shop_connections','alibaba_synced_products','alibaba_synced_orders','alibaba_synced_inventory','alibaba_sync_logs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "owner_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "owner_delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "owner_select" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "owner_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "owner_update" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "owner_delete" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;
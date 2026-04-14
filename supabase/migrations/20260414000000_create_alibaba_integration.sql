-- Alibaba Shop Integration: create all 5 tables, RLS policies, indexes, triggers, and RPC functions.

-- ============================================================
-- TRIGGER FUNCTION (shared)
-- Reuse existing update_updated_at_column() if available,
-- otherwise define a compatible one for this migration context.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TABLE: alibaba_shop_connections
-- Stores OAuth connection metadata per shop.
-- Tokens are NOT stored here — they live in vault.secrets.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alibaba_shop_connections (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform                  TEXT        NOT NULL CHECK (platform IN ('alibaba_com', '1688', 'taobao')),
  shop_id                   TEXT        NOT NULL,
  shop_name                 TEXT,
  scopes                    TEXT[]      NOT NULL DEFAULT '{}',
  status                    TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disconnected')),
  access_token_expires_at   TIMESTAMPTZ,
  refresh_token_expires_at  TIMESTAMPTZ,
  vault_secret_name         TEXT,
  last_synced_at            TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_alibaba_connections_user_platform_shop UNIQUE (user_id, platform, shop_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alibaba_connections_user_id
  ON public.alibaba_shop_connections (user_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_connections_status
  ON public.alibaba_shop_connections (status);

CREATE INDEX IF NOT EXISTS idx_alibaba_connections_token_expiry
  ON public.alibaba_shop_connections (access_token_expires_at)
  WHERE status = 'active';

-- updated_at trigger
CREATE TRIGGER update_alibaba_connections_updated_at
  BEFORE UPDATE ON public.alibaba_shop_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.alibaba_shop_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON public.alibaba_shop_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON public.alibaba_shop_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON public.alibaba_shop_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON public.alibaba_shop_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: alibaba_products
-- Stores product data synced from a connected Alibaba shop.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alibaba_products (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id       UUID          NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  external_product_id TEXT          NOT NULL,
  title               TEXT,
  image_url           TEXT,
  price_min           NUMERIC(12,2),
  price_max           NUMERIC(12,2),
  currency            TEXT          NOT NULL DEFAULT 'USD',
  moq                 INTEGER,
  category            TEXT,
  status              TEXT,
  raw_data            JSONB         NOT NULL DEFAULT '{}',
  synced_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_alibaba_products_connection_product UNIQUE (connection_id, external_product_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alibaba_products_connection_id
  ON public.alibaba_products (connection_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_products_user_id
  ON public.alibaba_products (user_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_products_synced_at
  ON public.alibaba_products (synced_at);

-- RLS
ALTER TABLE public.alibaba_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alibaba_products"
  ON public.alibaba_products FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: alibaba_orders
-- Stores order data synced from a connected Alibaba shop.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alibaba_orders (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id     UUID          NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  external_order_id TEXT          NOT NULL,
  order_status      TEXT,
  total_amount      NUMERIC(12,2),
  currency          TEXT          NOT NULL DEFAULT 'USD',
  buyer_name        TEXT,
  item_count        INTEGER,
  ordered_at        TIMESTAMPTZ,
  raw_data          JSONB         NOT NULL DEFAULT '{}',
  synced_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_alibaba_orders_connection_order UNIQUE (connection_id, external_order_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alibaba_orders_connection_id
  ON public.alibaba_orders (connection_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_orders_user_id
  ON public.alibaba_orders (user_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_orders_ordered_at
  ON public.alibaba_orders (ordered_at DESC);

-- RLS
ALTER TABLE public.alibaba_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alibaba_orders"
  ON public.alibaba_orders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: alibaba_inventory
-- Stores inventory/stock data synced from a connected Alibaba shop.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alibaba_inventory (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id       UUID          NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  external_product_id TEXT          NOT NULL,
  sku                 TEXT,
  warehouse           TEXT,
  quantity            INTEGER       NOT NULL DEFAULT 0,
  reserved_quantity   INTEGER       NOT NULL DEFAULT 0,
  raw_data            JSONB         NOT NULL DEFAULT '{}',
  synced_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_alibaba_inventory_connection_product_sku UNIQUE (connection_id, external_product_id, sku)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alibaba_inventory_connection_id
  ON public.alibaba_inventory (connection_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_inventory_user_id
  ON public.alibaba_inventory (user_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_inventory_product_id
  ON public.alibaba_inventory (connection_id, external_product_id);

-- RLS
ALTER TABLE public.alibaba_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alibaba_inventory"
  ON public.alibaba_inventory FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: alibaba_sync_logs
-- Tracks sync history and provides concurrency control.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alibaba_sync_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id   UUID          NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,
  entity_type     TEXT          NOT NULL CHECK (entity_type IN ('products', 'orders', 'inventory', 'all')),
  status          TEXT          NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'partial', 'failed')),
  records_synced  INTEGER       NOT NULL DEFAULT 0,
  last_page       INTEGER,
  error_message   TEXT,
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alibaba_sync_logs_connection_id
  ON public.alibaba_sync_logs (connection_id);

CREATE INDEX IF NOT EXISTS idx_alibaba_sync_logs_status
  ON public.alibaba_sync_logs (connection_id, status)
  WHERE status = 'in_progress';

-- RLS
ALTER TABLE public.alibaba_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs"
  ON public.alibaba_sync_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync logs"
  ON public.alibaba_sync_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: service_role only (Edge Functions manage sync status transitions).
-- No authenticated UPDATE policy — prevents client-side manipulation of sync status,
-- which would break concurrency control (in_progress check).
-- DELETE: blocked (no policy) — sync logs are append-only.

-- ============================================================
-- RPC: alibaba_delete_connection(p_connection_id UUID)
-- Verifies ownership, then deletes the connection row.
-- CASCADE handles child tables automatically.
-- Vault secret cleanup is the Edge Function's responsibility
-- (called BEFORE this RPC via the Vault HTTP API).
-- ============================================================

CREATE OR REPLACE FUNCTION public.alibaba_delete_connection(p_connection_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Verify ownership
  SELECT user_id INTO v_user_id
  FROM public.alibaba_shop_connections
  WHERE id = p_connection_id AND user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Connection not found or not owned by user';
  END IF;

  -- Delete connection (CASCADE handles child tables).
  -- Vault secret is deleted by alibaba-disconnect Edge Function BEFORE calling this RPC.
  DELETE FROM public.alibaba_shop_connections WHERE id = p_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: alibaba_connections_needing_refresh()
-- Returns connections whose access token expires within 1 hour.
-- Service-role only — not callable by authenticated/anon users
-- to prevent cross-user data exposure.
-- ============================================================

CREATE OR REPLACE FUNCTION public.alibaba_connections_needing_refresh()
RETURNS TABLE (
  connection_id           UUID,
  user_id                 UUID,
  vault_secret_name       TEXT,
  access_token_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  -- This function is SECURITY DEFINER and returns all users' data.
  -- Must only be called from Edge Functions with the service_role key.
  -- NOT exposed via PostgREST/client — always call via supabase.rpc() with service role.
  RETURN QUERY
  SELECT c.id, c.user_id, c.vault_secret_name, c.access_token_expires_at
  FROM public.alibaba_shop_connections c
  WHERE c.status = 'active'
    AND c.access_token_expires_at < now() + INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Restrict alibaba_connections_needing_refresh to service_role only
REVOKE EXECUTE ON FUNCTION public.alibaba_connections_needing_refresh() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.alibaba_connections_needing_refresh() FROM anon;
-- M7: also revoke from public (covers any other inherited grants)
REVOKE EXECUTE ON FUNCTION public.alibaba_connections_needing_refresh() FROM public;

-- ============================================================
-- H3: Vault wrapper RPCs
-- Public-schema wrappers around vault extension functions.
-- Required because Edge Functions call supabase.rpc("vault_*")
-- which routes through PostgREST and needs public-schema symbols.
-- All three are SECURITY DEFINER and restricted to service_role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.vault_create_secret(new_secret TEXT, new_name TEXT)
RETURNS UUID AS $$
  SELECT vault.create_secret(new_secret, new_name);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, vault;

CREATE OR REPLACE FUNCTION public.vault_read_secret(secret_name TEXT)
RETURNS TABLE(id UUID, name TEXT, secret TEXT) AS $$
  SELECT s.id, s.name, ds.decrypted_secret AS secret
  FROM vault.secrets s
  JOIN vault.decrypted_secrets ds ON s.id = ds.id
  WHERE s.name = secret_name;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, vault;

CREATE OR REPLACE FUNCTION public.vault_update_secret(secret_name TEXT, new_secret TEXT)
RETURNS VOID AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = secret_name;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Vault secret not found: %', secret_name;
  END IF;
  PERFORM vault.update_secret(v_id, new_secret);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(secret_id UUID)
RETURNS VOID AS $$
  DELETE FROM vault.secrets WHERE id = secret_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, vault;

-- Restrict vault wrappers to service_role only
REVOKE EXECUTE ON FUNCTION public.vault_create_secret(TEXT, TEXT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.vault_read_secret(TEXT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.vault_update_secret(TEXT, TEXT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(UUID) FROM authenticated, anon, public;

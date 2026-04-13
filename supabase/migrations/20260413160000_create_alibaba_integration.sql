-- ============================================================================
-- Phase 1.1 — Alibaba.com Open Platform Integration (Schema)
-- ----------------------------------------------------------------------------
-- Creates connection tracking and cache tables for Alibaba OAuth integration.
-- Raw access_token / refresh_token are NOT stored here — they live in Supabase
-- Vault and are referenced by `vault_secret_name`.
--
-- See docs/adr/0001-alibaba-integration.md for the full design rationale.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
-- Vault: required for encrypted token storage.
-- If this fails, enable Vault at Supabase Dashboard → Settings → Vault first.
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

-- pg_net is used by the refresh-token cron job to invoke the Edge Function.
-- Scheduling itself is added in a later migration once Edge Function URLs are known.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 1. alibaba_shop_connections
--    One row per (user, platform, shop). Stores connection metadata only;
--    tokens live in Supabase Vault under `vault_secret_name`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alibaba_shop_connections (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Platform identity
    platform                  TEXT NOT NULL DEFAULT 'alibaba_com'
                              CHECK (platform IN ('alibaba_com', '1688', 'taobao')),
    shop_id                   TEXT NOT NULL,        -- External shop/vendor identifier from the platform
    shop_name                 TEXT,                 -- Display name, cached from last API response

    -- OAuth scopes granted by the shop owner (may be a subset of requested scopes)
    scopes                    TEXT[] NOT NULL DEFAULT '{}',

    -- Connection lifecycle
    status                    TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'refresh_required', 'revoked', 'error')),
    last_error                TEXT,                 -- Human-readable last error, nullable

    -- Token lifecycle (values, not the tokens themselves)
    access_token_expires_at   TIMESTAMPTZ,
    refresh_token_expires_at  TIMESTAMPTZ,
    last_refreshed_at         TIMESTAMPTZ,

    -- Vault reference (tokens themselves live in vault.secrets by this name)
    vault_secret_name         TEXT NOT NULL UNIQUE, -- Format: "alibaba_token_<this.id>"

    -- Freeform extras (token type, region, etc.)
    metadata                  JSONB NOT NULL DEFAULT '{}',

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, platform, shop_id)
);

COMMENT ON TABLE  public.alibaba_shop_connections IS
    'Alibaba OAuth connection metadata. Tokens live in Supabase Vault — this table only references them.';
COMMENT ON COLUMN public.alibaba_shop_connections.vault_secret_name IS
    'Name of the Vault secret holding the JSON-encoded token bundle: {access_token, refresh_token, token_type}';
COMMENT ON COLUMN public.alibaba_shop_connections.scopes IS
    'OAuth scopes actually granted (subset of requested). Used for UI feature-gating.';
COMMENT ON COLUMN public.alibaba_shop_connections.status IS
    'active: operational · refresh_required: access token expired, needs refresh · revoked: user disconnected · error: last refresh failed';

CREATE INDEX idx_alibaba_conn_user_id           ON public.alibaba_shop_connections(user_id);
CREATE INDEX idx_alibaba_conn_status            ON public.alibaba_shop_connections(status);
CREATE INDEX idx_alibaba_conn_access_expires    ON public.alibaba_shop_connections(access_token_expires_at)
    WHERE status = 'active';

ALTER TABLE public.alibaba_shop_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Alibaba connections"
    ON public.alibaba_shop_connections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Alibaba connections"
    ON public.alibaba_shop_connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Alibaba connections"
    ON public.alibaba_shop_connections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Alibaba connections"
    ON public.alibaba_shop_connections FOR DELETE
    USING (auth.uid() = user_id);

CREATE TRIGGER set_alibaba_conn_updated_at
    BEFORE UPDATE ON public.alibaba_shop_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. alibaba_order_cache
--    Snapshot of last-synced orders per connection. TTL 30 days.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alibaba_order_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id   UUID NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,

    -- External identity
    external_order_id   TEXT NOT NULL,              -- Alibaba order ID
    status              TEXT,                       -- e.g. 'waiting_buyer_pay', 'shipped', 'refunding'
    buyer_name          TEXT,
    total_amount        NUMERIC(18, 4),
    currency            TEXT,                       -- ISO 4217
    ordered_at          TIMESTAMPTZ,                -- Normalized to UTC
    shipped_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,

    -- Full payload for forward compatibility (so new fields don't require schema change)
    raw                 JSONB NOT NULL DEFAULT '{}',

    -- Sync bookkeeping
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(connection_id, external_order_id)
);

COMMENT ON TABLE  public.alibaba_order_cache IS
    'Cached order snapshots from Alibaba. Refreshed on demand. TTL 30 days.';
COMMENT ON COLUMN public.alibaba_order_cache.raw IS
    'Full API response object. Use for fields not yet promoted to columns.';

CREATE INDEX idx_alibaba_orders_user_id      ON public.alibaba_order_cache(user_id);
CREATE INDEX idx_alibaba_orders_connection   ON public.alibaba_order_cache(connection_id);
CREATE INDEX idx_alibaba_orders_status       ON public.alibaba_order_cache(status);
CREATE INDEX idx_alibaba_orders_ordered_at   ON public.alibaba_order_cache(ordered_at DESC);
CREATE INDEX idx_alibaba_orders_expires_at   ON public.alibaba_order_cache(expires_at);

ALTER TABLE public.alibaba_order_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Alibaba orders"
    ON public.alibaba_order_cache FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Alibaba orders"
    ON public.alibaba_order_cache FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Alibaba orders"
    ON public.alibaba_order_cache FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Alibaba orders"
    ON public.alibaba_order_cache FOR DELETE
    USING (auth.uid() = user_id);

CREATE TRIGGER set_alibaba_orders_updated_at
    BEFORE UPDATE ON public.alibaba_order_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 3. alibaba_message_cache
--    Cached TradeManager messages. TTL 7 days. Stored per-thread.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alibaba_message_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id   UUID NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,

    -- Thread-level identity
    external_thread_id   TEXT NOT NULL,
    external_message_id  TEXT,                   -- NULL for thread-summary rows
    participant_name     TEXT,                   -- Buyer or counterparty display name
    participant_id       TEXT,
    direction            TEXT CHECK (direction IN ('inbound', 'outbound', NULL)),
    content_preview      TEXT,                   -- First ~200 chars; full content in raw
    sent_at              TIMESTAMPTZ,            -- Normalized to UTC
    last_message_at      TIMESTAMPTZ,            -- Updated on every sync for thread-summary rows
    unread               BOOLEAN DEFAULT FALSE,

    raw                  JSONB NOT NULL DEFAULT '{}',

    synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(connection_id, external_thread_id, external_message_id)
);

COMMENT ON TABLE  public.alibaba_message_cache IS
    'Cached TradeManager messages. TTL 7 days. Can hold both thread summaries and individual messages.';

CREATE INDEX idx_alibaba_msgs_user_id       ON public.alibaba_message_cache(user_id);
CREATE INDEX idx_alibaba_msgs_connection    ON public.alibaba_message_cache(connection_id);
CREATE INDEX idx_alibaba_msgs_thread        ON public.alibaba_message_cache(external_thread_id);
CREATE INDEX idx_alibaba_msgs_unread        ON public.alibaba_message_cache(unread) WHERE unread = TRUE;
CREATE INDEX idx_alibaba_msgs_last_at       ON public.alibaba_message_cache(last_message_at DESC);
CREATE INDEX idx_alibaba_msgs_expires_at    ON public.alibaba_message_cache(expires_at);

ALTER TABLE public.alibaba_message_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Alibaba messages"
    ON public.alibaba_message_cache FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Alibaba messages"
    ON public.alibaba_message_cache FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Alibaba messages"
    ON public.alibaba_message_cache FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Alibaba messages"
    ON public.alibaba_message_cache FOR DELETE
    USING (auth.uid() = user_id);

CREATE TRIGGER set_alibaba_msgs_updated_at
    BEFORE UPDATE ON public.alibaba_message_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 4. alibaba_inventory_cache
--    Per-SKU inventory snapshot. No hard TTL — refreshed on demand or via cron.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alibaba_inventory_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connection_id   UUID NOT NULL REFERENCES public.alibaba_shop_connections(id) ON DELETE CASCADE,

    external_product_id   TEXT NOT NULL,        -- Alibaba product/listing ID
    sku                   TEXT NOT NULL,        -- SKU code or variant identifier
    product_name          TEXT,
    variant_label         TEXT,                 -- e.g. "Red / XL"
    warehouse             TEXT,                 -- Warehouse code if multi-warehouse
    quantity              INTEGER NOT NULL DEFAULT 0,
    reserved_quantity     INTEGER,              -- Held by open orders
    safety_stock          INTEGER,
    unit_price            NUMERIC(18, 4),
    currency              TEXT,

    raw                   JSONB NOT NULL DEFAULT '{}',

    synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(connection_id, external_product_id, sku, warehouse)
);

COMMENT ON TABLE  public.alibaba_inventory_cache IS
    'Cached per-SKU inventory snapshot. Refreshed on demand. No hard TTL — considered stale after 24h by convention.';

CREATE INDEX idx_alibaba_inv_user_id       ON public.alibaba_inventory_cache(user_id);
CREATE INDEX idx_alibaba_inv_connection    ON public.alibaba_inventory_cache(connection_id);
CREATE INDEX idx_alibaba_inv_product       ON public.alibaba_inventory_cache(external_product_id);
CREATE INDEX idx_alibaba_inv_synced_at     ON public.alibaba_inventory_cache(synced_at);

ALTER TABLE public.alibaba_inventory_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Alibaba inventory"
    ON public.alibaba_inventory_cache FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Alibaba inventory"
    ON public.alibaba_inventory_cache FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Alibaba inventory"
    ON public.alibaba_inventory_cache FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Alibaba inventory"
    ON public.alibaba_inventory_cache FOR DELETE
    USING (auth.uid() = user_id);

CREATE TRIGGER set_alibaba_inv_updated_at
    BEFORE UPDATE ON public.alibaba_inventory_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 5. Helper: connections needing refresh
--    View used by alibaba-refresh-token Edge Function (cron) to find tokens
--    that will expire within the next hour. SECURITY DEFINER lets the
--    function read across all users; access is gated by Edge Function auth.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.alibaba_connections_needing_refresh()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    platform TEXT,
    shop_id TEXT,
    vault_secret_name TEXT,
    access_token_expires_at TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        c.id, c.user_id, c.platform, c.shop_id,
        c.vault_secret_name,
        c.access_token_expires_at, c.refresh_token_expires_at
    FROM public.alibaba_shop_connections c
    WHERE c.status IN ('active', 'refresh_required')
      AND c.access_token_expires_at IS NOT NULL
      AND c.access_token_expires_at < (now() + INTERVAL '1 hour')
      AND (c.refresh_token_expires_at IS NULL
           OR c.refresh_token_expires_at > now());
$$;

COMMENT ON FUNCTION public.alibaba_connections_needing_refresh IS
    'Returns connections whose access_token expires within the next hour and whose refresh_token is still valid. Called by alibaba-refresh-token Edge Function.';

REVOKE ALL ON FUNCTION public.alibaba_connections_needing_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alibaba_connections_needing_refresh() TO service_role;


-- ============================================================================
-- 6. Helper: delete a connection + its Vault secret atomically
--    Used by alibaba-disconnect Edge Function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.alibaba_delete_connection(p_connection_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_name TEXT;
    v_user_id     UUID;
BEGIN
    -- Fetch the Vault secret name + owner, and ensure caller owns it
    SELECT vault_secret_name, user_id
      INTO v_secret_name, v_user_id
      FROM public.alibaba_shop_connections
     WHERE id = p_connection_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Alibaba connection % not found', p_connection_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Permission denied for connection %', p_connection_id
            USING ERRCODE = '42501';
    END IF;

    -- Delete the Vault secret if it exists
    DELETE FROM vault.secrets WHERE name = v_secret_name;

    -- Delete the connection row (cascades to cache tables via FK ON DELETE CASCADE)
    DELETE FROM public.alibaba_shop_connections WHERE id = p_connection_id;
END;
$$;

COMMENT ON FUNCTION public.alibaba_delete_connection IS
    'Atomically deletes an Alibaba connection, its Vault secret, and cascades its cache rows. Caller must own the connection.';

REVOKE ALL ON FUNCTION public.alibaba_delete_connection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alibaba_delete_connection(UUID) TO authenticated;


-- ============================================================================
-- 7. Helper: purge expired cache rows (called by cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.alibaba_purge_expired_cache()
RETURNS TABLE (orders_deleted BIGINT, messages_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orders   BIGINT;
    v_messages BIGINT;
BEGIN
    WITH d AS (
        DELETE FROM public.alibaba_order_cache
         WHERE expires_at < now()
        RETURNING 1
    )
    SELECT count(*) INTO v_orders FROM d;

    WITH d AS (
        DELETE FROM public.alibaba_message_cache
         WHERE expires_at < now()
        RETURNING 1
    )
    SELECT count(*) INTO v_messages FROM d;

    RETURN QUERY SELECT v_orders, v_messages;
END;
$$;

COMMENT ON FUNCTION public.alibaba_purge_expired_cache IS
    'Deletes expired rows from alibaba_order_cache (TTL 30d) and alibaba_message_cache (TTL 7d). Safe to call frequently.';

REVOKE ALL ON FUNCTION public.alibaba_purge_expired_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alibaba_purge_expired_cache() TO service_role;


-- ============================================================================
-- End of migration.
-- Next migration will register pg_cron jobs once Edge Function URLs are known:
--   - alibaba-refresh-token (every 30 min)
--   - alibaba_purge_expired_cache (daily)
-- ============================================================================

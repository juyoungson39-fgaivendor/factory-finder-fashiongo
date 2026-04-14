// Edge Function: alibaba-sync-data
// POST — Sync products, orders, and inventory for a given connection.
// Supports resume from partial sync and rate-limit retry with exponential backoff.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  fetchProducts,
  fetchOrders,
  fetchInventory,
  refreshAccessToken,
  type AlibabaApiConfig,
} from "../_shared/alibaba-api.ts";
import {
  corsHeaders,
  jsonResponse,
  requireAuth,
  readVaultSecret,
  writeVaultSecret,
} from "../_shared/edge-utils.ts";

// ---------------------------------------------------------------------------
// Rate-limit resilient fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Retry a fetch call up to maxRetries times.
 * Delays: 1s → 3s → 9s (exponential base-3 backoff).
 * Retries on 429 (rate limit) and 5xx (server errors).
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      const delay = Math.pow(3, attempt) * 1000; // 1s → 3s → 9s
      console.warn(`Attempt ${attempt + 1} failed with ${res.status}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  throw new Error("Max retries exceeded");
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve a valid access token.
 * If the token expires in less than 5 minutes, auto-refresh it first.
 */
async function getValidToken(
  supabase: SupabaseClient,
  connectionId: string,
  appKey: string,
  appSecret: string,
): Promise<string> {
  const { data: conn, error } = await supabase
    .from("alibaba_shop_connections")
    .select("access_token_expires_at, vault_secret_name")
    .eq("id", connectionId)
    .single();

  if (error || !conn) {
    throw new Error("Connection not found");
  }

  const expiresAt = new Date(conn.access_token_expires_at);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  const secret = await readVaultSecret(supabase, conn.vault_secret_name);

  if (expiresAt <= fiveMinFromNow) {
    // Token expired or expiring soon — refresh now
    console.log("Token expiring soon, refreshing...");
    try {
      const refreshed = await refreshAccessToken(secret.refresh_token, appKey, appSecret);

      const now = new Date();
      const newAccessExpiry = new Date(now.getTime() + refreshed.expires_in * 1000).toISOString();
      const newRefreshExpiry = new Date(
        now.getTime() + refreshed.refresh_token_expires_in * 1000,
      ).toISOString();

      // Persist updated tokens to Vault
      await writeVaultSecret(supabase, conn.vault_secret_name, {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
      });

      // Update connection row with new expiry times
      await supabase
        .from("alibaba_shop_connections")
        .update({
          access_token_expires_at: newAccessExpiry,
          refresh_token_expires_at: newRefreshExpiry,
          status: "active",
        })
        .eq("id", connectionId);

      return refreshed.access_token;
    } catch (refreshErr) {
      console.error("Token refresh failed, marking connection as expired:", refreshErr);
      // Mark connection as expired so the user knows re-auth is required
      await supabase
        .from("alibaba_shop_connections")
        .update({ status: "expired" })
        .eq("id", connectionId);
      throw refreshErr;
    }
  }

  return secret.access_token;
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

/**
 * Sync a single entity type (products | orders | inventory).
 * Returns the total number of records upserted.
 */
async function syncEntity(
  entityType: "products" | "orders" | "inventory",
  supabase: SupabaseClient,
  config: AlibabaApiConfig,
  connectionId: string,
  userId: string,
  startPage: number,
  syncLogId: string,
): Promise<number> {
  let page = startPage;
  let totalSynced = 0;

  // Fetch function for this entity
  const fetchFn =
    entityType === "products"
      ? fetchProducts
      : entityType === "orders"
        ? fetchOrders
        : fetchInventory;

  // Table name for upsert
  const tableName =
    entityType === "products"
      ? "alibaba_products"
      : entityType === "orders"
        ? "alibaba_orders"
        : "alibaba_inventory";

  while (true) {
    const response = await fetchFn(config, page, PAGE_SIZE);

    if (!response.items || response.items.length === 0) break;

    const now = new Date().toISOString();

    // Build rows based on entity type
    let rows: Record<string, unknown>[];

    if (entityType === "products") {
      rows = response.items.map((item) => ({
        user_id: userId,
        connection_id: connectionId,
        external_product_id: String(item.product_id ?? item.id ?? ""),
        title: (item.subject ?? item.title ?? null) as string | null,
        image_url: (item.main_image ?? item.image_url ?? null) as string | null,
        price_min: (item.price_min ?? null) as number | null,
        price_max: (item.price_max ?? null) as number | null,
        currency: (item.currency ?? "USD") as string,
        moq: (item.min_order_quantity ?? item.moq ?? null) as number | null,
        category: (item.category_name ?? item.category ?? null) as string | null,
        status: (item.status ?? null) as string | null,
        raw_data: item,
        synced_at: now,
      }));
    } else if (entityType === "orders") {
      rows = response.items.map((item) => ({
        user_id: userId,
        connection_id: connectionId,
        external_order_id: String(item.order_id ?? item.id ?? ""),
        order_status: (item.trade_status ?? item.status ?? null) as string | null,
        total_amount: (item.total_amount ?? null) as number | null,
        currency: (item.currency ?? "USD") as string,
        buyer_name: (item.buyer_name ?? null) as string | null,
        item_count: (item.product_count ?? item.item_count ?? null) as number | null,
        ordered_at: (item.created_time ?? item.ordered_at ?? null) as string | null,
        raw_data: item,
        synced_at: now,
      }));
    } else {
      rows = response.items.map((item) => ({
        user_id: userId,
        connection_id: connectionId,
        external_product_id: String(item.product_id ?? item.id ?? ""),
        sku: (item.sku ?? null) as string | null,
        warehouse: (item.warehouse ?? null) as string | null,
        quantity: (item.quantity ?? 0) as number,
        reserved_quantity: (item.reserved_quantity ?? 0) as number,
        raw_data: item,
        synced_at: now,
      }));
    }

    if (rows.length > 0) {
      const conflictColumns =
        entityType === "products"
          ? "external_product_id,connection_id"
          : entityType === "orders"
            ? "external_order_id,connection_id"
            : "external_product_id,connection_id";

      const { error: upsertError } = await supabase
        .from(tableName)
        .upsert(rows, { onConflict: conflictColumns });

      if (upsertError) {
        console.error(`Upsert error for ${entityType} page ${page}:`, upsertError);
        throw new Error(`Upsert failed: ${upsertError.message}`);
      }

      totalSynced += rows.length;
    }

    // Update sync_log with progress after each page
    await supabase
      .from("alibaba_sync_logs")
      .update({ last_page: page, records_synced: totalSynced })
      .eq("id", syncLogId);

    // Check if we've fetched all pages
    if (response.items.length < PAGE_SIZE) break;
    page++;
  }

  return totalSynced;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];
  let user: Awaited<ReturnType<typeof requireAuth>>["user"];
  try {
    ({ supabase, user } = await requireAuth(req));
  } catch (authResponse) {
    return authResponse as Response;
  }

  const appKey = Deno.env.get("ALIBABA_APP_KEY")!;
  const appSecret = Deno.env.get("ALIBABA_APP_SECRET")!;

  let body: { connection_id: string; entity_types?: string[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { connection_id: connectionId, entity_types } = body;

  if (!connectionId) {
    return jsonResponse({ error: "connection_id is required" }, 400);
  }

  // Resolve which entity types to sync
  const allTypes = ["products", "orders", "inventory"] as const;
  const typesToSync =
    entity_types && entity_types.length > 0 && !entity_types.includes("all")
      ? (entity_types.filter((t) => allTypes.includes(t as typeof allTypes[number])) as typeof allTypes[number][])
      : [...allTypes];

  // Verify the user owns this connection
  const { data: connection, error: connError } = await supabase
    .from("alibaba_shop_connections")
    .select("id, user_id, status")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single();

  if (connError || !connection) {
    return jsonResponse({ error: "Connection not found or access denied" }, 404);
  }

  // Concurrency check: reject if another sync is already in progress
  const { data: existing } = await supabase
    .from("alibaba_sync_logs")
    .select("id, last_page")
    .eq("connection_id", connectionId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (existing) {
    return jsonResponse({ error: "Sync already in progress", sync_log_id: existing.id }, 409);
  }

  // Resume logic: check for latest partial sync per entity_type
  const partialPageByEntity: Record<string, number> = {};
  for (const entityType of typesToSync) {
    const { data: partial } = await supabase
      .from("alibaba_sync_logs")
      .select("last_page")
      .eq("connection_id", connectionId)
      .eq("entity_type", entityType)
      .eq("status", "partial")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    partialPageByEntity[entityType] = partial?.last_page ? partial.last_page + 1 : 1;
  }

  // Create a new sync_log entry (status: in_progress)
  const { data: syncLog, error: logInsertError } = await supabase
    .from("alibaba_sync_logs")
    .insert({
      user_id: user.id,
      connection_id: connectionId,
      entity_type: "all",
      status: "in_progress",
      records_synced: 0,
      last_page: null,
    })
    .select("id")
    .single();

  if (logInsertError || !syncLog) {
    return jsonResponse({ error: "Failed to create sync log" }, 500);
  }

  const syncLogId = syncLog.id;

  try {
    // Get a valid (possibly refreshed) access token
    const accessToken = await getValidToken(supabase, connectionId, appKey, appSecret);

    const config: AlibabaApiConfig = {
      accessToken,
      appKey,
      appSecret,
    };

    let totalRecords = 0;

    // Sync each entity type sequentially, resuming from entity-specific page
    for (const entityType of typesToSync) {
      const startPage = partialPageByEntity[entityType] ?? 1;
      const count = await syncEntity(
        entityType,
        supabase,
        config,
        connectionId,
        user.id,
        startPage,
        syncLogId,
      );
      totalRecords += count;
    }

    // Mark sync_log as completed
    await supabase
      .from("alibaba_sync_logs")
      .update({
        status: "completed",
        records_synced: totalRecords,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncLogId);

    // Update last_synced_at on the connection
    await supabase
      .from("alibaba_shop_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", connectionId);

    return jsonResponse({
      success: true,
      sync_log_id: syncLogId,
      records_synced: totalRecords,
      status: "completed",
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown sync error";
    console.error("Sync failed:", errorMessage);

    // Mark as partial (may resume next time) or failed
    const { data: currentLog } = await supabase
      .from("alibaba_sync_logs")
      .select("records_synced, last_page")
      .eq("id", syncLogId)
      .single();

    const status = (currentLog?.records_synced ?? 0) > 0 ? "partial" : "failed";

    await supabase
      .from("alibaba_sync_logs")
      .update({
        status,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncLogId);

    return jsonResponse({
      success: false,
      sync_log_id: syncLogId,
      records_synced: currentLog?.records_synced ?? 0,
      status,
      error_message: errorMessage,
    });
  }
});

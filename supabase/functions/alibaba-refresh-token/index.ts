// Edge Function: alibaba-refresh-token
// POST /functions/v1/alibaba-refresh-token
//
// Service-role-only endpoint. Invoked by pg_cron every 30 min (via pg_net)
// or manually for a single connection_id.
// Refreshes access tokens nearing expiry and updates connection status.
//
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §3.3 + §5.3.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  getServiceClient,
  requireServiceRoleBearer,
  UnauthorizedError,
} from "../_shared/alibaba-supabase.ts";
import {
  getTokenBundle,
  putTokenBundle,
  type AlibabaTokenBundle,
} from "../_shared/alibaba-vault.ts";
import { refreshAccessToken, AlibabaApiError } from "../_shared/alibaba-client.ts";
import type { RefreshTokenResponse } from "../_shared/alibaba-dtos.ts";

const MAX_PER_INVOCATION = 20;
const STAGGER_MS = 200;

interface ConnectionRow {
  id: string;
  user_id: string;
  platform: string;
  shop_id: string;
  vault_secret_name: string;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
}

interface RefreshReqBody {
  connection_id?: string;
}

function addSeconds(base: Date, seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

async function selectTargets(connectionId?: string): Promise<ConnectionRow[]> {
  const supa = getServiceClient();
  if (connectionId !== undefined && connectionId !== "") {
    const { data, error } = await supa
      .from("alibaba_shop_connections")
      .select("id, user_id, platform, shop_id, vault_secret_name, access_token_expires_at, refresh_token_expires_at")
      .eq("id", connectionId)
      .maybeSingle();
    if (error !== null) throw new Error(`select-single failed: ${error.message}`);
    return data ? [data as ConnectionRow] : [];
  }

  const { data, error } = await supa.rpc("alibaba_connections_needing_refresh");
  if (error !== null) throw new Error(`rpc needing_refresh failed: ${error.message}`);
  const rows = (data ?? []) as ConnectionRow[];
  return rows.slice(0, MAX_PER_INVOCATION);
}

async function refreshOne(row: ConnectionRow): Promise<void> {
  const supa = getServiceClient();
  let bundle: AlibabaTokenBundle;
  try {
    bundle = await getTokenBundle(row.vault_secret_name);
  } catch (err) {
    const msg = `vault_read_failed: ${String(err)}`;
    console.error("[alibaba-refresh-token] read vault failed", {
      connection_id: row.id,
      error: msg,
    });
    await supa
      .from("alibaba_shop_connections")
      .update({ status: "error", last_error: msg.slice(0, 500) })
      .eq("id", row.id);
    throw err;
  }

  let newBundle: AlibabaTokenBundle;
  try {
    newBundle = await refreshAccessToken(bundle.refresh_token);
  } catch (err) {
    if (err instanceof AlibabaApiError && err.code === "invalid_grant") {
      console.warn("[alibaba-refresh-token] refresh_token expired", {
        connection_id: row.id,
        user_id: row.user_id,
      });
      await supa
        .from("alibaba_shop_connections")
        .update({
          status: "refresh_required",
          last_error: "refresh_token expired",
        })
        .eq("id", row.id);
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    await supa
      .from("alibaba_shop_connections")
      .update({ status: "error", last_error: msg.slice(0, 500) })
      .eq("id", row.id);
    throw err;
  }

  await putTokenBundle(row.vault_secret_name, newBundle);

  const now = new Date();
  const { error: updErr } = await supa
    .from("alibaba_shop_connections")
    .update({
      status: "active",
      last_error: null,
      last_refreshed_at: now.toISOString(),
      access_token_expires_at: addSeconds(now, newBundle.expires_in_seconds),
      refresh_token_expires_at: newBundle.refresh_expires_in_seconds !== null
        ? addSeconds(now, newBundle.refresh_expires_in_seconds)
        : row.refresh_token_expires_at,
      // Always assign an explicit array — `undefined` would make Supabase skip
      // the update, retaining stale scopes if the provider narrowed them.
      scopes: newBundle.scope ? newBundle.scope.split(" ").filter(Boolean) : [],
    })
    .eq("id", row.id);
  if (updErr !== null) {
    throw new Error(`update connection failed: ${updErr.message}`);
  }

  console.log("[alibaba-refresh-token] refreshed", {
    connection_id: row.id,
    user_id: row.user_id,
    platform: row.platform,
    shop_id: row.shop_id,
  });
}

serve(async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", 405);
  }

  try {
    requireServiceRoleBearer(req);

    let body: RefreshReqBody = {};
    if (req.headers.get("content-length") !== "0") {
      try {
        body = (await req.json()) as RefreshReqBody;
      } catch {
        // empty body is allowed
        body = {};
      }
    }

    const targets = await selectTargets(body.connection_id);

    const response: RefreshTokenResponse = {
      refreshed: 0,
      skipped: 0,
      failed: [],
    };

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      try {
        await refreshOne(row);
        response.refreshed++;
      } catch (err) {
        response.failed.push({
          connection_id: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, STAGGER_MS));
      }
    }

    return jsonResponse(response, { status: 200, headers: corsHeaders });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return errorResponse("unauthorized", 401);
    }
    console.error("[alibaba-refresh-token] fatal:", err);
    return errorResponse("internal_error", 500);
  }
});

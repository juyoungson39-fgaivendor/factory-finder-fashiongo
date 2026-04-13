// Edge Function: alibaba-disconnect
// POST /functions/v1/alibaba-disconnect
//
// User-initiated disconnect. Best-effort revoke at Alibaba, then calls the
// alibaba_delete_connection SQL function which atomically removes the
// connection row + Vault secret + cascades caches.
//
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §3.4 + §5.4.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { requireUser, getServiceClient, UnauthorizedError } from "../_shared/alibaba-supabase.ts";
import { getTokenBundle } from "../_shared/alibaba-vault.ts";
import { revokeToken } from "../_shared/alibaba-client.ts";
import type { DisconnectRequest, DisconnectResponse } from "../_shared/alibaba-dtos.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", 405);
  }

  try {
    const { user, client: userClient } = await requireUser(req);

    let body: DisconnectRequest;
    try {
      body = (await req.json()) as DisconnectRequest;
    } catch {
      return errorResponse("invalid_json_body", 400);
    }

    const connectionId = body.connection_id;
    if (typeof connectionId !== "string" || !UUID_RE.test(connectionId)) {
      return errorResponse("invalid_connection_id", 400);
    }

    // 1. Verify ownership via RLS-enforced user client, fetch vault_secret_name.
    const { data: row, error: selErr } = await userClient
      .from("alibaba_shop_connections")
      .select("id, vault_secret_name")
      .eq("id", connectionId)
      .maybeSingle();

    if (selErr !== null) {
      console.error("[alibaba-disconnect] select failed:", selErr);
      return errorResponse("select_failed", 500);
    }
    if (row === null) {
      return errorResponse("not_found", 404);
    }

    // 2. Best-effort revoke at Alibaba. Never fail the disconnect on this step.
    try {
      const bundle = await getTokenBundle(row.vault_secret_name);
      await revokeToken(bundle.access_token);
    } catch (err) {
      console.warn("[alibaba-disconnect] revoke step ignored:", String(err));
    }

    // 3. Atomically delete connection + vault secret via SQL function.
    // The function re-checks ownership (auth.uid()) but the service client
    // loses that context, so we call it through the user client instead.
    const { error: rpcErr } = await userClient.rpc("alibaba_delete_connection", {
      p_connection_id: connectionId,
    });

    if (rpcErr !== null) {
      console.error("[alibaba-disconnect] rpc failed:", rpcErr);
      // Fallback: try via service client as a best-effort cleanup (rare path
      // only hit if the RPC requires elevated privileges in future).
      const svc = getServiceClient();
      const { error: fallbackErr } = await svc.rpc("alibaba_delete_connection", {
        p_connection_id: connectionId,
      });
      if (fallbackErr !== null) {
        return errorResponse("delete_failed", 500, { detail: fallbackErr.message });
      }
    }

    console.log("[alibaba-disconnect] disconnected", {
      user_id: user.id,
      connection_id: connectionId,
    });

    const response: DisconnectResponse = { ok: true };
    return jsonResponse(response, { status: 200, headers: corsHeaders });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return errorResponse("unauthorized", 401);
    }
    console.error("[alibaba-disconnect] fatal:", err);
    return errorResponse("internal_error", 500);
  }
});

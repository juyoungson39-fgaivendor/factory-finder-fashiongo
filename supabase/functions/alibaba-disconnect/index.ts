// Edge Function: alibaba-disconnect
// POST — Disconnect an Alibaba shop connection.
// Deletes the Vault secret and removes the connection row (CASCADE cleans child tables).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, requireAuth } from "../_shared/edge-utils.ts";

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

  let body: { connection_id: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { connection_id: connectionId } = body;
  if (!connectionId) {
    return jsonResponse({ error: "connection_id is required" }, 400);
  }

  // Fetch connection row and verify ownership
  const { data: connection, error: connError } = await supabase
    .from("alibaba_shop_connections")
    .select("id, user_id, vault_secret_name")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single();

  if (connError || !connection) {
    return jsonResponse({ error: "Connection not found or access denied" }, 404);
  }

  const vaultSecretName: string | null = connection.vault_secret_name;

  // Delete the Vault secret if one exists
  if (vaultSecretName) {
    const { error: vaultDeleteError } = await supabase.rpc("vault_delete_secret", {
      secret_name: vaultSecretName,
    });

    if (vaultDeleteError) {
      // Log and continue — the DB row deletion is more important
      console.error("Vault delete error (non-fatal):", vaultDeleteError.message);
    }
  }

  // Call alibaba_delete_connection RPC — CASCADE removes all child table rows
  const { error: rpcError } = await supabase.rpc("alibaba_delete_connection", {
    p_connection_id: connectionId,
  });

  if (rpcError) {
    console.error("alibaba_delete_connection RPC error:", rpcError);
    // Fall back to direct delete if RPC doesn't exist yet
    const { error: deleteError } = await supabase
      .from("alibaba_shop_connections")
      .delete()
      .eq("id", connectionId)
      .eq("user_id", user.id);

    if (deleteError) {
      return jsonResponse({ error: `Failed to delete connection: ${deleteError.message}` }, 500);
    }
  }

  return jsonResponse({ success: true });
});

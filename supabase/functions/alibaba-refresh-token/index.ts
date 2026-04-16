// Edge Function: alibaba-refresh-token
// POST — Refresh an Alibaba access token using the stored refresh token.
// On success: updates Vault secret + connection row with new expiry dates.
// On failure: sets connection status to 'expired'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { refreshAccessToken } from "../_shared/alibaba-api.ts";
import { corsHeaders, jsonResponse, requireAuth, readVaultSecret, writeVaultSecret } from "../_shared/edge-utils.ts";

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

  // Fetch connection row — verify ownership
  const { data: connection, error: connError } = await supabase
    .from("alibaba_shop_connections")
    .select("id, user_id, vault_secret_name")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single();

  if (connError || !connection) {
    return jsonResponse({ error: "Connection not found or access denied" }, 404);
  }

  const vaultSecretName: string = connection.vault_secret_name;

  let storedSecret: { access_token: string; refresh_token: string };
  try {
    storedSecret = await readVaultSecret(supabase, vaultSecretName);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Failed to read Vault secret" }, 500);
  }

  try {
    // Call Alibaba refresh token endpoint
    const refreshed = await refreshAccessToken(storedSecret.refresh_token, appKey, appSecret);

    const now = new Date();
    const newAccessExpiry = new Date(now.getTime() + refreshed.expires_in * 1000).toISOString();
    const newRefreshExpiry = new Date(
      now.getTime() + refreshed.refresh_token_expires_in * 1000,
    ).toISOString();

    // Update Vault with new tokens
    await writeVaultSecret(supabase, vaultSecretName, {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
    });

    // Update connection row with new expiry timestamps and restore active status
    const { error: updateError } = await supabase
      .from("alibaba_shop_connections")
      .update({
        access_token_expires_at: newAccessExpiry,
        refresh_token_expires_at: newRefreshExpiry,
        status: "active",
      })
      .eq("id", connectionId);

    if (updateError) {
      throw new Error(`Failed to update connection: ${updateError.message}`);
    }

    return jsonResponse({
      success: true,
      new_expires_at: newAccessExpiry,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown refresh error";
    console.error("Token refresh failed:", errorMessage);

    // Mark connection as expired so the UI can prompt re-connect
    await supabase
      .from("alibaba_shop_connections")
      .update({ status: "expired" })
      .eq("id", connectionId);

    return jsonResponse({ success: false, error: errorMessage }, 200);
  }
});

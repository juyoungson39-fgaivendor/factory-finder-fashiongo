import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { exchangeCodeForTokens } from "../_shared/alibaba-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appKey = Deno.env.get("ALIBABA_APP_KEY")!;
  const appSecret = Deno.env.get("ALIBABA_APP_SECRET")!;

  // Determine where to redirect the browser on success/failure
  // Use SITE_URL env if set; otherwise fall back to the request Origin header
  const siteUrl =
    Deno.env.get("SITE_URL") ??
    req.headers.get("origin") ??
    "http://localhost:8080";

  const redirectBase = `${siteUrl}/settings/alibaba`;

  // Parse query params from the GET redirect
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  // Validate required params
  if (!code || !stateParam) {
    return Response.redirect(`${redirectBase}?error=missing_params`, 302);
  }

  // Decode and validate HMAC-signed CSRF state
  // Format: base64(payload).<HMAC-SHA256 signature>
  let statePayload: { user_id: string; nonce: string; platform: string; ts: number };
  const dotIndex = stateParam.lastIndexOf(".");
  if (dotIndex === -1) {
    return Response.redirect(`${redirectBase}?error=invalid_state`, 302);
  }
  const payloadB64 = stateParam.slice(0, dotIndex);
  const sigReceived = stateParam.slice(dotIndex + 1);

  try {
    statePayload = JSON.parse(atob(payloadB64));
  } catch {
    return Response.redirect(`${redirectBase}?error=invalid_state`, 302);
  }

  if (!statePayload.user_id || !statePayload.nonce || !statePayload.platform || !statePayload.ts) {
    return Response.redirect(`${redirectBase}?error=invalid_state`, 302);
  }

  // Verify HMAC signature
  const enc = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", hmacKey, enc.encode(payloadB64));
  const sigExpected = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  if (sigExpected !== sigReceived) {
    return Response.redirect(`${redirectBase}?error=invalid_state`, 302);
  }

  // Check timestamp is less than 10 minutes old
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  if (Date.now() - statePayload.ts > TEN_MINUTES_MS) {
    return Response.redirect(`${redirectBase}?error=state_expired`, 302);
  }

  const userId = statePayload.user_id;
  const platform = statePayload.platform;

  // Use service_role client for Vault + DB writes
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Build the redirect URI (must match what was sent to Alibaba)
    const redirectUri = `${supabaseUrl}/functions/v1/alibaba-oauth-callback`;

    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForTokens(code, appKey, appSecret, redirectUri);

    // Generate a unique connection ID upfront so we can name the Vault secret
    const connectionId = crypto.randomUUID();
    const vaultSecretName = `alibaba_token_${connectionId}`;

    // Store ONLY access_token + refresh_token in Vault (NOT app_key/secret)
    const secretPayload = JSON.stringify({
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
    });

    // Write to Vault using vault.create_secret RPC
    const { error: vaultError } = await supabase.rpc("vault_create_secret", {
      new_secret: secretPayload,
      new_name: vaultSecretName,
    });

    if (vaultError) {
      console.error("Vault write error:", vaultError);
      return Response.redirect(`${redirectBase}?error=vault_error`, 302);
    }

    // Calculate token expiry timestamps
    const now = new Date();
    const accessTokenExpiresAt = new Date(
      now.getTime() + tokenResponse.expires_in * 1000,
    ).toISOString();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + tokenResponse.refresh_token_expires_in * 1000,
    ).toISOString();

    // Insert alibaba_shop_connections row
    const { error: insertError } = await supabase
      .from("alibaba_shop_connections")
      .insert({
        id: connectionId,
        user_id: userId,
        platform: platform,
        shop_id: tokenResponse.user_id,
        shop_name: tokenResponse.user_nick || null,
        scopes: [],
        status: "active",
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        vault_secret_name: vaultSecretName,
      });

    if (insertError) {
      console.error("DB insert error:", insertError);
      // Compensating action: clean up the orphaned Vault secret
      const { data: vaultRows } = await supabase.rpc("vault_read_secret", {
        secret_name: vaultSecretName,
      });
      if (vaultRows && vaultRows.length > 0) {
        await supabase.rpc("vault_delete_secret", { secret_id: vaultRows[0].id }).catch((e: unknown) =>
          console.error("Vault orphan cleanup failed:", e),
        );
      }
      return Response.redirect(`${redirectBase}?error=db_error`, 302);
    }

    // Trigger initial sync — fire and forget (do NOT await)
    const syncUrl = `${supabaseUrl}/functions/v1/alibaba-sync-data`;
    fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ connection_id: connectionId, entity_types: ["products", "orders", "inventory"] }),
    }).catch((err) => console.error("Initial sync trigger error:", err));

    // Redirect browser to settings page with success indicator
    return Response.redirect(`${redirectBase}?connected=true`, 302);
  } catch (err) {
    console.error("alibaba-oauth-callback error:", err);
    const errorCode = err instanceof Error ? encodeURIComponent(err.message.slice(0, 60)) : "unknown";
    return Response.redirect(`${redirectBase}?error=${errorCode}`, 302);
  }
});

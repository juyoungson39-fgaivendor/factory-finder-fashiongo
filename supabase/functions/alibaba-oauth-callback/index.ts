// Edge Function: alibaba-oauth-callback
// GET /functions/v1/alibaba-oauth-callback?code=...&state=...
//
// Handles Alibaba's redirect after user consent. No JWT (state-signed).
// Exchanges the authorization code for tokens, fetches shop info,
// writes the token bundle to Vault, inserts/updates the connection row,
// and 302-redirects back into the React app.
//
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §3.2 + §5.2.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { config } from "../_shared/alibaba-config.ts";
import { verifyState, InvalidStateError } from "../_shared/alibaba-state.ts";
import { getServiceClient } from "../_shared/alibaba-supabase.ts";
import {
  exchangeCodeForTokens,
  fetchShopInfo,
  AlibabaApiError,
} from "../_shared/alibaba-client.ts";
import {
  putTokenBundle,
  deleteTokenBundle,
  type AlibabaTokenBundle,
} from "../_shared/alibaba-vault.ts";
import type { AlibabaErrorCode, AlibabaPlatform } from "../_shared/alibaba-dtos.ts";

function appRedirect(path: string, params: Record<string, string>): Response {
  const target = new URL(path, config.APP_ORIGIN);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
}

function errorRedirect(
  returnTo: string | undefined,
  code: AlibabaErrorCode,
  message?: string,
): Response {
  const path = returnTo ?? "/settings/alibaba";
  const params: Record<string, string> = { error: code };
  if (message) params.message = message;
  return appRedirect(path, params);
}

function successRedirect(returnTo: string | undefined, connectionId: string): Response {
  const path = returnTo ?? "/settings/alibaba";
  return appRedirect(path, { connected: "1", connection_id: connectionId });
}

function addSeconds(base: Date, seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "23505";
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const upstreamError = params.get("error");
  const code = params.get("code");
  const stateParam = params.get("state");

  // 1. Upstream error from Alibaba (user denied, etc.)
  if (upstreamError !== null) {
    console.warn("[alibaba-oauth-callback] upstream error:", {
      error: upstreamError,
      description: params.get("error_description"),
    });
    return errorRedirect(undefined, mapAlibabaError(upstreamError), upstreamError);
  }

  if (code === null || stateParam === null) {
    return errorRedirect(undefined, "invalid_state", "missing_params");
  }

  // 2. Verify state
  let statePayload;
  try {
    statePayload = await verifyState(stateParam);
  } catch (err) {
    if (err instanceof InvalidStateError) {
      const errCode: AlibabaErrorCode = err.message.includes("expired")
        ? "expired_state"
        : "invalid_state";
      console.warn("[alibaba-oauth-callback] state rejected:", err.message);
      return errorRedirect(undefined, errCode);
    }
    console.error("[alibaba-oauth-callback] state verify unexpected error:", err);
    return errorRedirect(undefined, "unknown");
  }

  const returnTo = statePayload.return_to;
  const platform: AlibabaPlatform = statePayload.platform ?? "alibaba_com";
  const userId = statePayload.user_id;

  // 3. Exchange code for tokens
  let tokens: AlibabaTokenBundle;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    const msg = err instanceof AlibabaApiError ? err.code ?? err.message : String(err);
    console.error("[alibaba-oauth-callback] token exchange failed:", msg);
    return errorRedirect(returnTo, "exchange_failed");
  }

  // 4. Fetch shop info (best-effort, falls back internally)
  const { shop_id, shop_name } = await fetchShopInfo(tokens.access_token);

  // 5. Prepare connection row + vault secret
  const connectionId = crypto.randomUUID();
  const vaultSecretName = `alibaba_token_${connectionId}`;
  const now = new Date();
  const accessExpires = addSeconds(now, tokens.expires_in_seconds);
  const refreshExpires = addSeconds(now, tokens.refresh_expires_in_seconds);

  // 6. Put token bundle in Vault
  try {
    await putTokenBundle(vaultSecretName, tokens);
  } catch (err) {
    console.error("[alibaba-oauth-callback] vault put failed:", err);
    return errorRedirect(returnTo, "db_insert_failed");
  }

  // 7. Insert connection row — with explicit idempotency + orphan cleanup on failure
  const supa = getServiceClient();
  let finalConnectionId = connectionId;
  try {
    const { error: insertErr } = await supa
      .from("alibaba_shop_connections")
      .insert({
        id: connectionId,
        user_id: userId,
        platform,
        shop_id,
        shop_name,
        scopes: tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [],
        status: "active",
        access_token_expires_at: accessExpires,
        refresh_token_expires_at: refreshExpires,
        last_refreshed_at: now.toISOString(),
        vault_secret_name: vaultSecretName,
        metadata: {
          issued_at: tokens.issued_at,
          environment: config.ENV,
        },
      });

    if (insertErr !== null && insertErr !== undefined) {
      throw insertErr;
    }

    console.log("[alibaba-oauth-callback] connected", {
      user_id: userId,
      connection_id: connectionId,
      platform,
      shop_id,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Re-connect path: row already exists for (user_id, platform, shop_id).
      // Overwrite the existing Vault slot with the new tokens and delete the orphan secret.
      try {
        const { data: existing, error: selErr } = await supa
          .from("alibaba_shop_connections")
          .select("id, vault_secret_name")
          .eq("user_id", userId)
          .eq("platform", platform)
          .eq("shop_id", shop_id)
          .single();

        if (selErr !== null || existing === null) {
          console.error("[alibaba-oauth-callback] reconnect lookup failed:", selErr);
          await deleteTokenBundle(vaultSecretName).catch((e) =>
            console.error("[alibaba-oauth-callback] orphan cleanup failed:", e)
          );
          return errorRedirect(returnTo, "db_insert_failed");
        }

        await putTokenBundle(existing.vault_secret_name, tokens);
        await deleteTokenBundle(vaultSecretName).catch((e) =>
          console.error("[alibaba-oauth-callback] orphan cleanup failed:", e)
        );

        const { error: updErr } = await supa
          .from("alibaba_shop_connections")
          .update({
            status: "active",
            scopes: tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [],
            access_token_expires_at: accessExpires,
            refresh_token_expires_at: refreshExpires,
            last_refreshed_at: now.toISOString(),
            last_error: null,
            shop_name: shop_name ?? undefined,
          })
          .eq("id", existing.id);

        if (updErr !== null && updErr !== undefined) {
          console.error("[alibaba-oauth-callback] reconnect update failed:", updErr);
          return errorRedirect(returnTo, "db_insert_failed");
        }

        finalConnectionId = existing.id;
        console.log("[alibaba-oauth-callback] reconnected", {
          user_id: userId,
          connection_id: existing.id,
          platform,
          shop_id,
        });
      } catch (reErr) {
        console.error("[alibaba-oauth-callback] reconnect path failed:", reErr);
        await deleteTokenBundle(vaultSecretName).catch(() => {/* best-effort */});
        return errorRedirect(returnTo, "db_insert_failed");
      }
    } else {
      // Generic DB failure after Vault put — clean up the orphan secret.
      console.error("[alibaba-oauth-callback] insert failed:", err);
      await deleteTokenBundle(vaultSecretName).catch((e) =>
        console.error("[alibaba-oauth-callback] orphan cleanup failed:", e)
      );
      return errorRedirect(returnTo, "db_insert_failed");
    }
  }

  // 8. Redirect back into the app
  return successRedirect(returnTo, finalConnectionId);
});

function mapAlibabaError(upstream: string): AlibabaErrorCode {
  switch (upstream) {
    case "access_denied":
      return "revoked";
    case "invalid_request":
    case "invalid_scope":
      return "invalid_state";
    default:
      return "unknown";
  }
}

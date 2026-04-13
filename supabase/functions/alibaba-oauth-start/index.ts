// Edge Function: alibaba-oauth-start
// POST /functions/v1/alibaba-oauth-start
//
// Verifies the user JWT, validates return_to against APP_ORIGIN, signs an
// HMAC state token, and returns the Alibaba authorize URL + state.
//
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §3.1 + §4.6 + §5.1.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { config } from "../_shared/alibaba-config.ts";
import { requireUser, UnauthorizedError } from "../_shared/alibaba-supabase.ts";
import { signState, type StatePayload } from "../_shared/alibaba-state.ts";
import type { OAuthStartRequest, OAuthStartResponse, AlibabaPlatform } from "../_shared/alibaba-dtos.ts";

function validateReturnTo(candidate: unknown): string | undefined {
  if (candidate === undefined || candidate === null || candidate === "") return undefined;
  if (typeof candidate !== "string") {
    throw new Error("return_to must be a string");
  }
  // Accept either a path starting with "/" OR a full URL under APP_ORIGIN.
  if (candidate.startsWith("/")) return candidate;
  if (candidate.startsWith(`${config.APP_ORIGIN}/`) || candidate === config.APP_ORIGIN) {
    return candidate.slice(config.APP_ORIGIN.length) || "/";
  }
  throw new Error(`return_to must be under APP_ORIGIN (${config.APP_ORIGIN})`);
}

function validatePlatform(p: unknown): AlibabaPlatform | undefined {
  if (p === undefined || p === null) return undefined;
  if (p === "alibaba_com" || p === "1688" || p === "taobao") return p;
  throw new Error(`Unsupported platform: ${String(p)}`);
}

serve(async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", 405);
  }

  try {
    const { user } = await requireUser(req);

    let body: OAuthStartRequest = {};
    if (req.headers.get("content-length") !== "0") {
      try {
        body = (await req.json()) as OAuthStartRequest;
      } catch {
        return errorResponse("invalid_json_body", 400);
      }
    }

    let returnTo: string | undefined;
    let platform: AlibabaPlatform;
    try {
      returnTo = validateReturnTo(body.return_to);
      platform = validatePlatform(body.platform) ?? "alibaba_com";
    } catch (err) {
      return errorResponse("invalid_request", 400, { detail: String((err as Error).message) });
    }

    const payload: StatePayload = {
      user_id: user.id,
      nonce: crypto.randomUUID(),
      return_to: returnTo,
      platform,
      iat: Math.floor(Date.now() / 1000),
    };
    const state = await signState(payload);

    const authorizeUrl = new URL(config.OAUTH_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", config.CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", config.REDIRECT_URI);
    if (config.DEFAULT_SCOPES !== "") {
      authorizeUrl.searchParams.set("scope", config.DEFAULT_SCOPES);
    }
    authorizeUrl.searchParams.set("state", state);

    const response: OAuthStartResponse = {
      authorize_url: authorizeUrl.toString(),
      state,
    };

    console.log("[alibaba-oauth-start] issued state", {
      user_id: user.id,
      platform,
      return_to: returnTo ?? "(default)",
    });
    return jsonResponse(response, { status: 200, headers: corsHeaders });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return errorResponse("unauthorized", 401);
    }
    console.error("[alibaba-oauth-start] error:", err);
    return errorResponse("internal_error", 500);
  }
});

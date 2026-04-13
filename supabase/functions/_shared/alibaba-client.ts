// Alibaba.com Open Platform REST wrapper.
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §4.5.
//
// Lifecycle semantics:
//   - exchangeCodeForTokens / refreshAccessToken : propagate errors (caller must handle).
//   - revokeToken                                : best-effort, swallows all errors.
//   - fetchShopInfo                              : best-effort with fallback — returns
//                                                  { shop_id: 'unknown_<uuid>', shop_name: null }
//                                                  on any failure so the OAuth flow can still
//                                                  complete end-to-end.

import { config } from "./alibaba-config.ts";
import type { AlibabaTokenBundle } from "./alibaba-vault.ts";

const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;

export class AlibabaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string | null,
    public readonly rawBody?: unknown,
  ) {
    super(message);
    this.name = "AlibabaApiError";
  }
}

type FetchOpts = Omit<RequestInit, "signal">;

async function fetchWithTimeoutAndRetry(
  url: string,
  opts: FetchOpts,
): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timer);
      // 5xx → retry once
      if (res.status >= 500 && attempt === 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("[alibaba-client] unreachable fetch loop exit");
}

function bundleFromTokenResponse(raw: Record<string, unknown>): AlibabaTokenBundle {
  const access = typeof raw["access_token"] === "string" ? raw["access_token"] : "";
  const refresh = typeof raw["refresh_token"] === "string" ? raw["refresh_token"] : "";
  if (access === "" || refresh === "") {
    throw new AlibabaApiError(
      "Token response missing access_token or refresh_token",
      null,
      "invalid_token_response",
      raw,
    );
  }

  // Alibaba sometimes returns expires_in, sometimes expires_in_seconds, etc.
  const expiresInNum = Number(
    raw["expires_in"] ?? raw["expires_in_seconds"] ?? 0,
  );
  const refreshExpiresRaw = raw["refresh_token_valid_time"] ??
    raw["refresh_expires_in"] ?? null;
  const refreshExpires = refreshExpiresRaw === null
    ? null
    : Number(refreshExpiresRaw);

  return {
    access_token: access,
    refresh_token: refresh,
    token_type: String(raw["token_type"] ?? "Bearer"),
    expires_in_seconds: Number.isFinite(expiresInNum) ? expiresInNum : 0,
    refresh_expires_in_seconds: refreshExpires !== null && Number.isFinite(refreshExpires)
      ? refreshExpires
      : null,
    issued_at: new Date().toISOString(),
    scope: String(raw["scope"] ?? config.DEFAULT_SCOPES),
    raw,
  };
}

async function postTokenEndpoint(
  body: URLSearchParams,
): Promise<AlibabaTokenBundle> {
  const res = await fetchWithTimeoutAndRetry(config.OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: body.toString(),
  });

  let json: Record<string, unknown>;
  try {
    json = await res.json() as Record<string, unknown>;
  } catch {
    throw new AlibabaApiError(
      `Token endpoint returned non-JSON (status ${res.status})`,
      res.status,
      "invalid_json",
    );
  }

  if (!res.ok || typeof json["error"] === "string") {
    const code = typeof json["error"] === "string" ? json["error"] : null;
    throw new AlibabaApiError(
      `Token endpoint error: ${code ?? res.status}`,
      res.status,
      code,
      json,
    );
  }

  return bundleFromTokenResponse(json);
}

export function exchangeCodeForTokens(code: string): Promise<AlibabaTokenBundle> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    redirect_uri: config.REDIRECT_URI,
  });
  return postTokenEndpoint(body);
}

export function refreshAccessToken(
  refreshToken: string,
): Promise<AlibabaTokenBundle> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
  });
  return postTokenEndpoint(body);
}

/**
 * Best-effort token revoke. Alibaba's revoke endpoint path varies per region;
 * this implementation attempts a conventional POST and swallows all errors so
 * disconnect flows can proceed even when the remote endpoint is flaky.
 */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    const url = `${config.API_BASE_URL.replace(/\/$/, "")}/oauth/revoke`;
    const body = new URLSearchParams({
      token: accessToken,
      client_id: config.CLIENT_ID,
      client_secret: config.CLIENT_SECRET,
    });
    await fetchWithTimeoutAndRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (err) {
    console.warn("[alibaba-client] revokeToken failed (ignored):", String(err));
  }
}

/**
 * Fetch the shop's public identity using the access token.
 * TODO: confirm exact endpoint + response shape against Alibaba docs during Sandbox testing.
 * On ANY failure (network, non-2xx, missing shop_id in response), returns a stable
 * fallback so the OAuth flow completes — the user can later rename the shop via UI.
 */
export async function fetchShopInfo(
  accessToken: string,
): Promise<{ shop_id: string; shop_name: string | null }> {
  try {
    const url = `${config.API_BASE_URL.replace(/\/$/, "")}/shop/info`;
    const res = await fetchWithTimeoutAndRetry(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      console.warn(`[alibaba-client] fetchShopInfo status ${res.status}, using fallback`);
      return fallbackShopInfo();
    }

    const json = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!json) return fallbackShopInfo();

    const candidate = (json["shop_id"] ??
      (json["data"] as Record<string, unknown> | undefined)?.["shop_id"] ??
      json["shop"] ??
      null) as string | number | null;
    if (candidate === null || candidate === undefined || candidate === "") {
      console.warn("[alibaba-client] fetchShopInfo missing shop_id, using fallback");
      return fallbackShopInfo();
    }

    const name = (json["shop_name"] ??
      (json["data"] as Record<string, unknown> | undefined)?.["shop_name"] ??
      null) as string | null;

    return { shop_id: String(candidate), shop_name: name ?? null };
  } catch (err) {
    console.warn("[alibaba-client] fetchShopInfo error, using fallback:", String(err));
    return fallbackShopInfo();
  }
}

function fallbackShopInfo(): { shop_id: string; shop_name: null } {
  return { shop_id: `unknown_${crypto.randomUUID()}`, shop_name: null };
}

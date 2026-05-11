// --- Alibaba.com Open Platform (GGS) API Client ---
//
// Shared utility module for the *new* Alibaba.com Open Platform (GGS) API.
// This replaces the legacy Taobao Open API (`eco.taobao.com/router/rest`) that
// the project used initially.
//
// Reference: https://openapi.alibaba.com/doc/doc.htm
//
// Key differences from the legacy API:
//   • Base URL:   https://openapi-api.alibaba.com/rest/{api_path}
//   • Signing:    HMAC-SHA256 (was MD5)
//   • Timestamp:  milliseconds since epoch (was "yyyy-MM-dd HH:mm:ss")
//   • Common params include `simplify=true` (response is unwrapped JSON)
//   • Response does NOT use the `{api_name}_response` envelope anymore
//
// OAuth authorization endpoint (used only by alibaba-oauth-start):
//   https://openapi-auth.alibaba.com/oauth/authorize
//
// No serve() — pure exported functions, follows google-auth.ts pattern.

const ALIBABA_API_BASE_URL = "https://openapi-api.alibaba.com/rest";

export interface AlibabaApiConfig {
  accessToken: string;
  appKey: string;
  appSecret: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total_count: number;
  page_no: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 signature
// ---------------------------------------------------------------------------

/**
 * Generate the GGS API request signature.
 *
 * Algorithm (per Alibaba.com Open Platform docs, "Signature algorithm"):
 *   1. Sort all parameters by key (ASCII order)
 *   2. Build the sign-input string: `apiPath + concat(key + value for each)`
 *   3. HMAC-SHA256(input, appSecret)  // appSecret is the HMAC key
 *   4. Convert the digest to UPPERCASE hex
 */
export async function signRequest(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string,
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  let stringToSign = apiPath;
  for (const key of sortedKeys) {
    stringToSign += key + params[key];
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(stringToSign));

  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Core caller
// ---------------------------------------------------------------------------

interface CallApiOptions {
  /** API path beginning with `/`, e.g. `/auth/token/create`. */
  apiPath: string;
  appKey: string;
  appSecret: string;
  /** Optional — required for business APIs, not used for /auth/token/create. */
  accessToken?: string;
  /** API-specific (business) parameters. */
  businessParams?: Record<string, string>;
}

/**
 * Build and call a GGS API endpoint.
 *
 * Handles the common parameters (`app_key`, `timestamp`, `sign_method`,
 * `simplify`, `sign`) and surfaces business errors thrown by the platform.
 *
 * Returns the parsed JSON body. Throws on HTTP errors or when the response
 * has a non-"0" `code` (GGS uses `code` + `message` for error reporting).
 */
async function callAlibabaApi(opts: CallApiOptions): Promise<Record<string, unknown>> {
  const { apiPath, appKey, appSecret, accessToken, businessParams = {} } = opts;

  const params: Record<string, string> = {
    app_key: appKey,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    simplify: "true",
    ...businessParams,
  };

  if (accessToken) {
    params.access_token = accessToken;
  }

  params.sign = await signRequest(apiPath, params, appSecret);

  // Per Alibaba.com Open Platform reference clients, business APIs expect
  // POST + application/x-www-form-urlencoded with the X-Protocol: GOP header.
  // Auth endpoints (/auth/token/*) accept the same shape, so we use it everywhere.
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, v);

  const res = await fetch(`${ALIBABA_API_BASE_URL}${apiPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "X-Protocol": "GOP",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alibaba API HTTP error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  // GGS reports errors via `code` + `message` (code "0" = success).
  const code = data.code as string | undefined;
  if (code !== undefined && code !== "0") {
    const message = (data.message as string) ?? (data.msg as string) ?? "Unknown error";
    throw new Error(`Alibaba API error [${code}]: ${message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// OAuth: code → tokens
// ---------------------------------------------------------------------------

/**
 * Exchange the OAuth authorization code (returned to the redirect URI) for
 * access + refresh tokens.
 *
 * Per docs, the response includes both `expires_in` / `refresh_expires_in`
 * (in seconds — relative durations) and `expire_time` / `refresh_token_valid_time`
 * (absolute timestamps in ms). We return the relative durations so the caller
 * can compute the wall-clock expiry consistently.
 *
 * `user_id` in the new platform corresponds to `havana_id` in the legacy
 * platform; both are surfaced for callers that need the migration mapping.
 */
export async function exchangeCodeForTokens(
  code: string,
  appKey: string,
  appSecret: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in: number;
  user_nick: string;
  user_id: string;
  havana_id: string;
}> {
  const data = await callAlibabaApi({
    apiPath: "/auth/token/create",
    appKey,
    appSecret,
    businessParams: { code },
  });

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_in: data.expires_in as number,
    refresh_token_expires_in: data.refresh_expires_in as number,
    user_nick: (data.user_nick as string) ?? (data.account as string) ?? "",
    user_id:
      (data.seller_id as string) ?? (data.user_id as string) ?? (data.havana_id as string) ?? "",
    havana_id: (data.havana_id as string) ?? "",
  };
}

/**
 * Refresh an expired access token using the stored refresh token.
 *
 * Note: per docs, "the duration of the access token will be reset, but the
 * duration of the refresh token will NOT be reset" — once `refresh_expires_in`
 * reaches 0, the seller must re-authorize.
 */
export async function refreshAccessToken(
  refreshToken: string,
  appKey: string,
  appSecret: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in: number;
}> {
  const data = await callAlibabaApi({
    apiPath: "/auth/token/refresh",
    appKey,
    appSecret,
    businessParams: { refresh_token: refreshToken },
  });

  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    expires_in: data.expires_in as number,
    refresh_token_expires_in: data.refresh_expires_in as number,
  };
}

// ---------------------------------------------------------------------------
// Business APIs — Products / Orders / Inventory
// ---------------------------------------------------------------------------
//
// Confirmed against the public Alibaba.com Open Platform reference clients
// (e.g. ronknight/alibaba-open-api). On the new GGS gateway, REST paths are
// the dot-separated method name with dots replaced by slashes, prefixed with
// `/`. So `alibaba.icbu.product.list` → `/alibaba/icbu/product/list`.
//
// The legacy placeholders (`/icbu/product/list`, `/ggs/order/list`,
// `/icbu/inventory/list`) returned `InvalidApiPath` because they were missing
// the `/alibaba` prefix.

/**
 * Fetch a paginated list of products owned by the authenticated seller.
 * Method: alibaba.icbu.product.list (ICBU-PRODUCT permission group).
 *
 * Response shape: { result: { products: [...], total_item: N } }
 */
export async function fetchProducts(
  config: AlibabaApiConfig,
  pageNo: number,
  pageSize: number,
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const data = await callAlibabaApi({
    apiPath: "/alibaba/icbu/product/list",
    appKey: config.appKey,
    appSecret: config.appSecret,
    accessToken: config.accessToken,
    businessParams: {
      filter_type: "onSelling",
      current_page: String(pageNo),
      page_size: String(pageSize),
      language: "ENGLISH",
    },
  });

  // GGS wraps successful responses in { result: { ... } }.
  const result = (data.result as Record<string, unknown> | undefined) ?? data;
  const products =
    (result.products as Record<string, unknown>[] | undefined) ??
    (result.items as Record<string, unknown>[] | undefined) ??
    [];
  const totalCount =
    (result.total_item as number | undefined) ??
    (result.total_count as number | undefined) ??
    products.length;

  return {
    items: products,
    total_count: totalCount,
    page_no: pageNo,
    page_size: pageSize,
  };
}

/**
 * Fetch a paginated list of orders for the authenticated seller.
 * Method: alibaba.seller.order.list (legacy ICBU trade method, exposed on
 * the new gateway under the same `/alibaba/...` path convention).
 *
 * Response shape: { result: { orders: [...], total_item: N } }
 */
export async function fetchOrders(
  config: AlibabaApiConfig,
  pageNo: number,
  pageSize: number,
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const data = await callAlibabaApi({
    apiPath: "/alibaba/seller/order/list",
    appKey: config.appKey,
    appSecret: config.appSecret,
    accessToken: config.accessToken,
    businessParams: {
      current_page: String(pageNo),
      page_size: String(pageSize),
    },
  });

  const result = (data.result as Record<string, unknown> | undefined) ?? data;
  const orders =
    (result.orders as Record<string, unknown>[] | undefined) ??
    (result.order_list as Record<string, unknown>[] | undefined) ??
    (result.items as Record<string, unknown>[] | undefined) ??
    [];
  const totalCount =
    (result.total_item as number | undefined) ??
    (result.total_count as number | undefined) ??
    orders.length;

  return {
    items: orders,
    total_count: totalCount,
    page_no: pageNo,
    page_size: pageSize,
  };
}

/**
 * Fetch inventory data for the authenticated seller.
 *
 * NOTE: The Alibaba.com Open Platform (GGS) does NOT expose a standalone
 * "list seller inventory" endpoint on the ICBU surface. Inventory lives on
 * each product's SKU detail (fetched via `alibaba.icbu.product.get`). To
 * keep the sync flow non-blocking we return an empty page here. A future
 * iteration can hydrate inventory by walking each product's SKU list.
 */
export async function fetchInventory(
  _config: AlibabaApiConfig,
  pageNo: number,
  pageSize: number,
): Promise<PaginatedResponse<Record<string, unknown>>> {
  return {
    items: [],
    total_count: 0,
    page_no: pageNo,
    page_size: pageSize,
  };
}


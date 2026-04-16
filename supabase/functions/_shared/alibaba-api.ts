// --- Alibaba API Client ---
// Shared utility module for Alibaba Open Platform API calls.
// No serve() — pure exported functions, follows google-auth.ts pattern.

const ALIBABA_API_BASE_URL = 'https://eco.taobao.com/router/rest';

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

/**
 * Generate Alibaba API request signature.
 * Algorithm: MD5(appSecret + sorted(key+value pairs) + appSecret).toUpperCase()
 */
export function signRequest(
  params: Record<string, string>,
  appSecret: string,
): string {
  // Sort params alphabetically by key, then concatenate as key+value (no separator)
  const sortedKeys = Object.keys(params).sort();
  let stringToSign = appSecret;
  for (const key of sortedKeys) {
    stringToSign += key + params[key];
  }
  stringToSign += appSecret;

  // MD5 via Web Crypto (Deno supports SubtleCrypto but not MD5 natively)
  // Use a pure-JS MD5 implementation compatible with Deno Edge Functions
  return md5(stringToSign).toUpperCase();
}

/**
 * Pure-JS MD5 implementation (no external deps, compatible with Deno Edge Functions).
 * Based on RFC 1321 reference implementation.
 */
function md5(input: string): string {
  const str = unescape(encodeURIComponent(input));
  const x: number[] = [];
  for (let i = 0; i < str.length; i++) {
    x[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
  }
  const strLen = str.length;
  x[strLen >> 2] |= 0x80 << ((strLen % 4) * 8);
  x[(((strLen + 8) >> 6) << 4) + 14] = strLen * 8;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

  function safeAdd(x: number, y: number) { return (x + y) | 0; }
  function bitRotateLeft(num: number, cnt: number) { return (num << cnt) | (num >>> (32 - cnt)); }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  for (let i = 0; i < x.length; i += 16) {
    const olda = a, oldb = b, oldc = c, oldd = d;

    a = md5ff(a, b, c, d, x[i], 7, -680876936);
    d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

    a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, x[i], 20, -373897302);
    a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, x[i], 11, -358537222);
    c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

    a = md5ii(a, b, c, d, x[i], 6, -198630844);
    d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  // Convert to hex string
  const hex = [a, b, c, d]
    .map((n) =>
      [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    )
    .join('');
  return hex;
}

/**
 * Build and call the Alibaba Open Platform API.
 * Handles common params (app_key, session, timestamp, sign_method, v, sign) automatically.
 */
async function callAlibabaApi(
  method: string,
  config: AlibabaApiConfig,
  extraParams: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const params: Record<string, string> = {
    method,
    app_key: config.appKey,
    session: config.accessToken,
    timestamp,
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    ...extraParams,
  };

  params.sign = signRequest(params, config.appSecret);

  const body = new URLSearchParams(params).toString();

  const res = await fetch(ALIBABA_API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alibaba API HTTP error (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;

  // Alibaba API wraps errors in an error_response key
  if (data.error_response) {
    const err = data.error_response as Record<string, unknown>;
    throw new Error(`Alibaba API error [${err.code}]: ${err.zh_desc ?? err.en_desc ?? 'Unknown error'}`);
  }

  return data;
}

/**
 * Fetch a paginated list of products from Alibaba API.
 * Uses alibaba.product.get or equivalent listing method.
 */
export async function fetchProducts(
  config: AlibabaApiConfig,
  pageNo: number,
  pageSize: number,
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const data = await callAlibabaApi('alibaba.product.get', config, {
    page_no: String(pageNo),
    page_size: String(pageSize),
  });

  const result = (data.alibaba_product_get_response ?? data) as Record<string, unknown>;
  const products = (result.products as Record<string, unknown>[] | undefined) ?? [];

  return {
    items: products,
    total_count: (result.total_count as number) ?? products.length,
    page_no: pageNo,
    page_size: pageSize,
  };
}

/**
 * Fetch a paginated list of orders from Alibaba API.
 * Uses alibaba.trade.getOrderList or equivalent.
 */
export async function fetchOrders(
  config: AlibabaApiConfig,
  pageNo: number,
  pageSize: number,
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const data = await callAlibabaApi('alibaba.trade.getOrderList', config, {
    page_no: String(pageNo),
    page_size: String(pageSize),
  });

  const result = (data.alibaba_trade_getorderlist_response ?? data) as Record<string, unknown>;
  const orders = (result.data as Record<string, unknown>[] | undefined) ?? [];

  return {
    items: orders,
    total_count: (result.total_count as number) ?? orders.length,
    page_no: pageNo,
    page_size: pageSize,
  };
}

/**
 * Fetch inventory data from Alibaba API.
 * Uses alibaba.inventory.getProductInventory or equivalent.
 */
export async function fetchInventory(
  config: AlibabaApiConfig,
  pageNo: number,
  pageSize: number,
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const data = await callAlibabaApi('alibaba.inventory.getProductInventory', config, {
    page_no: String(pageNo),
    page_size: String(pageSize),
  });

  const result = (data.alibaba_inventory_getproductinventory_response ?? data) as Record<string, unknown>;
  const inventory = (result.data as Record<string, unknown>[] | undefined) ?? [];

  return {
    items: inventory,
    total_count: (result.total_count as number) ?? inventory.length,
    page_no: pageNo,
    page_size: pageSize,
  };
}

/**
 * Exchange authorization code for access + refresh tokens.
 * Called after the OAuth callback redirects back with ?code=...
 */
export async function exchangeCodeForTokens(
  code: string,
  appKey: string,
  appSecret: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in: number;
  user_nick: string;
  user_id: string;
}> {
  const params: Record<string, string> = {
    method: 'taobao.top.auth.token.create',
    app_key: appKey,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  };
  params.sign = signRequest(params, appSecret);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(ALIBABA_API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange HTTP error (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;

  if (data.error_response) {
    const err = data.error_response as Record<string, unknown>;
    throw new Error(`Token exchange error [${err.code}]: ${err.zh_desc ?? err.en_desc}`);
  }

  const tokenData = (data.token_result ?? data) as Record<string, unknown>;

  return {
    access_token: tokenData.access_token as string,
    refresh_token: tokenData.refresh_token as string,
    expires_in: tokenData.expires_in as number,
    refresh_token_expires_in: tokenData.refresh_token_expires_in as number,
    user_nick: tokenData.taobao_user_nick as string ?? tokenData.user_nick as string ?? '',
    user_id: tokenData.taobao_user_id as string ?? tokenData.user_id as string ?? '',
  };
}

/**
 * Refresh an expired access token using the refresh token.
 * Called by the alibaba-refresh-token Edge Function on a schedule.
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
  const params: Record<string, string> = {
    method: 'taobao.top.auth.token.refresh',
    app_key: appKey,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };
  params.sign = signRequest(params, appSecret);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(ALIBABA_API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh HTTP error (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;

  if (data.error_response) {
    const err = data.error_response as Record<string, unknown>;
    throw new Error(`Token refresh error [${err.code}]: ${err.zh_desc ?? err.en_desc}`);
  }

  const tokenData = (data.token_result ?? data) as Record<string, unknown>;

  return {
    access_token: tokenData.access_token as string,
    refresh_token: tokenData.refresh_token as string,
    expires_in: tokenData.expires_in as number,
    refresh_token_expires_in: tokenData.refresh_token_expires_in as number,
  };
}

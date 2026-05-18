// Enrich existing `factory_alibaba_products` rows with detail-page
// attributes that the list-page crawl can't see: Material, Gross Weight,
// and the official category breadcrumb.
//
// Input (POST JSON body):
//   { product_id: UUID }              -- enrich one row
//   { product_ids: UUID[] }           -- enrich a specific list
//   { factory_id: UUID }              -- enrich every alibaba row for that factory
//   { factory_ids: UUID[] }           -- enrich rows across multiple factories
//   { only_missing?: boolean (default true), limit?: number (default 60) }
//                                     -- whole-account sweep, only rows where
//                                     -- enriched_at IS NULL
//
// Auth: requires a logged-in user (JWT). All reads/writes are scoped to that
// user via RLS.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";
const ACTOR_ID = "apify~website-content-crawler";

// Per-invocation safety cap. Each detail page is one Apify call (~40–90s),
// so a single edge function invocation should fit inside the 150s gateway
// idle timeout for "single product" usage. Bulk usage runs from the client
// (one invocation per product or small batch), the same way bulk-crawl
// works on the list page.
const MAX_PRODUCTS_PER_INVOCATION = 8;

// ---------------------------------------------------------------------------
// Apify fetcher (mirrors crawl-alibaba-products with detail-page tuning)
// ---------------------------------------------------------------------------

const CAPTCHA_SIGNALS = [
  "captcha interception",
  "unusual traffic",
  "verify you are human",
  "punish",
  "baxia",
  "滑动验证",
  "异常访问",
];

function isCaptchaPage(html: string): boolean {
  if (!html || html.length < 5000) return true;
  const lower = html.toLowerCase();
  return CAPTCHA_SIGNALS.some((s) => lower.includes(s));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ApifyFetchResult {
  ok: boolean;
  html?: string;
  status?: number;
  reason?: string;
  diag?: unknown;
}

async function fetchHtmlViaApify(targetUrl: string): Promise<ApifyFetchResult> {
  if (!APIFY_TOKEN) return { ok: false, reason: "no_apify_token" };

  const apiUrl =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=50&memory=2048&format=json`;

  const input = {
    startUrls: [{ url: targetUrl }],
    crawlerType: "playwright:chrome",
    maxCrawlDepth: 0,
    maxCrawlPages: 1,
    saveHtml: true,
    saveMarkdown: false,
    htmlTransformer: "none",
    readableTextCharThreshold: 100,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      apifyProxyCountry: "US",
    },
    initialConcurrency: 1,
    maxRequestRetries: 3,
    requestTimeoutSecs: 90,
    pageLoadTimeoutSecs: 60,
    preNavigationHooks: `[
      async ({ page }) => {
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      }
    ]`,
    postNavigationHooks: `[
      async ({ page }) => {
        await page.waitForTimeout(5000);
        try {
          await page.waitForSelector('[class*="breadcrumb"], [class*="attribute"], [class*="attr"]', { timeout: 10000 });
        } catch (_) { /* ok */ }
      }
    ]`,
  };

  const ac = new AbortController();
  const abortTimer = setTimeout(() => ac.abort(), 70_000);
  let r: Response;
  try {
    r = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(abortTimer);
    return { ok: false, reason: "apify_timeout", diag: String((e as Error).message || e) };
  }
  clearTimeout(abortTimer);
  const txt = await r.text();
  if (!r.ok) {
    return { ok: false, status: r.status, reason: "apify_http_error", diag: txt.slice(0, 500) };
  }
  let items: unknown[] = [];
  try {
    items = JSON.parse(txt);
  } catch {
    return { ok: false, reason: "apify_parse_error", diag: txt.slice(0, 500) };
  }
  if (!items.length) return { ok: false, reason: "apify_no_items" };
  const first = items[0] as Record<string, unknown>;
  const html = (first.html as string) ?? "";
  if (!html) return { ok: false, reason: "apify_no_html" };
  return { ok: true, html };
}

async function fetchWithCaptchaRetry(url: string, maxAttempts = 2): Promise<{
  ok: boolean;
  html?: string;
  reason?: string;
}> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetchHtmlViaApify(url);
    if (!r.ok) {
      if (attempt < maxAttempts) { await sleep(2000); continue; }
      return { ok: false, reason: r.reason };
    }
    if (!isCaptchaPage(r.html ?? "")) {
      return { ok: true, html: r.html };
    }
    if (attempt < maxAttempts) await sleep(2000);
  }
  return { ok: false, reason: "captcha_persistent" };
}

// ---------------------------------------------------------------------------
// HTML parsing — detail page
// ---------------------------------------------------------------------------

interface DetailParseResult {
  material: string | null;
  gross_weight_kg: number | null;
  category_path: string[] | null;
  attributes: Record<string, string>;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** Mirror of crawl-alibaba-products' patterns — used to map breadcrumb leaves
 *  back to the same 15-category vocabulary the UI filter uses. */
const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(dresses?|gowns?)\b/i,                           "Dress"],
  [/\b(two[- ]?piece|two[- ]?pcs?|sets?)\b/i,          "Set"],
  [/\b(jumpsuits?|rompers?)\b/i,                       "Jumpsuit"],
  [/\b(swimsuits?|bikinis?|swimwear)\b/i,              "Swimwear"],
  [/\b(lingerie|underwear|bras?|panty|panties)\b/i,    "Lingerie"],
  [/\b(hoodies?|hoody)\b/i,                            "Hoodie"],
  [/\b(sweaters?|jumpers?|knits?)\b/i,                 "Sweater"],
  [/\b(cardigans?)\b/i,                                "Cardigan"],
  [/\b(jackets?|blazers?)\b/i,                         "Jacket"],
  [/\b(coats?)\b/i,                                    "Coat"],
  [/\b(suits?)\b/i,                                    "Suit"],
  [/\b(skirts?)\b/i,                                   "Skirt"],
  [/\b(pants?|trousers|leggings|jeans|shorts)\b/i,     "Pants"],
  [/\b(t[- ]?shirts?|tees?|tops?)\b/i,                 "Top"],
  [/\b(shirts?|blouses?)\b/i,                          "Shirt"],
];

export function categoryFromBreadcrumb(path: string[] | null): string | null {
  if (!path || path.length === 0) return null;
  // Try most-specific (leaf) first, then walk up.
  for (let i = path.length - 1; i >= 0; i--) {
    const seg = path[i];
    for (const [re, cat] of CATEGORY_PATTERNS) {
      if (re.test(seg)) return cat;
    }
  }
  return null;
}

/**
 * Pull every Label/Value attribute pair we can find. Alibaba detail pages
 * use several different DOM shapes depending on the layout (new vs legacy,
 * mobile vs desktop) so we try multiple regexes and take the first hit per
 * label.
 */
function extractAttributes(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: string) => {
    const key = decodeEntities(k.trim()).replace(/:$/, "").trim();
    const val = decodeEntities(v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (key && val && !(key in out)) out[key] = val;
  };

  // Format A: <div class="...left...">Label</div><div class="...right...">Value</div>
  const reA = /<div[^>]*class="[^"]*\bleft\b[^"]*"[^>]*>([^<]+)<\/div>\s*<div[^>]*class="[^"]*\bright\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const m of html.matchAll(reA)) put(m[1], m[2]);

  // Format B: <td>Label</td><td>Value</td>
  const reB = /<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  for (const m of html.matchAll(reB)) put(m[1], m[2]);

  // Format C: <dt>Label</dt><dd>Value</dd>
  const reC = /<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  for (const m of html.matchAll(reC)) put(m[1], m[2]);

  // Format D: <span class="attr-name">Label</span><span class="attr-value">Value</span>
  const reD = /<span[^>]*class="[^"]*attr-name[^"]*"[^>]*>([^<]+)<\/span>\s*<span[^>]*class="[^"]*attr-value[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  for (const m of html.matchAll(reD)) put(m[1], m[2]);

  return out;
}

/** Parse "Gross Weight: 0.5 kg" / "Weight: 500 g" — return kg. */
function parseWeightToKg(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/([\d.]+)\s*(kg|kilograms?|g|grams?|lbs?|pounds?)/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith("kg") || unit.startsWith("kilogram")) return value;
  if (unit.startsWith("g") || unit.startsWith("gram"))      return value / 1000;
  if (unit.startsWith("lb") || unit.startsWith("pound"))    return Math.round(value * 0.4536 * 1000) / 1000;
  return null;
}

function findBreadcrumb(html: string): string[] | null {
  // Try several common container shapes. The capture is whatever lives
  // inside the breadcrumb wrapper; from there we pull anchor text.
  const containerPatterns = [
    /<nav[^>]*(?:class|id)="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/nav>/i,
    /<(?:ol|ul)[^>]*(?:class|id)="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/(?:ol|ul)>/i,
    /<div[^>]*(?:class|id)="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*(?:class|id)="[^"]*\bpdp[-_]?breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const re of containerPatterns) {
    const m = html.match(re);
    if (!m) continue;
    const inner = m[1];
    const anchors = Array.from(inner.matchAll(/<a[^>]*>([^<]+)<\/a>/gi));
    const path = anchors
      .map((a) => decodeEntities(a[1]).trim())
      .filter((s) => s && s.toLowerCase() !== "home" && s.toLowerCase() !== "alibaba.com");
    if (path.length > 0) return path;
  }
  return null;
}

function parseDetailPage(html: string): DetailParseResult {
  const attributes = extractAttributes(html);

  // Material: prefer structured attribute; fall back to inline text.
  const matKeys = ["Material", "Fabric Type", "Composition", "Main Fabric Composition"];
  let material: string | null = null;
  for (const k of matKeys) {
    if (attributes[k]) { material = attributes[k]; break; }
  }
  if (!material) {
    const text = stripHtml(html);
    const m = text.match(/\b(?:Material|Fabric\s+Type|Composition)\s*:\s*([^,;|]{2,80})/i);
    if (m) material = m[1].trim();
  }

  // Weight: same approach. Prefer "Gross Weight" over generic "Weight".
  const wKeys = ["Gross Weight", "Net Weight", "Weight", "Product Weight"];
  let weightRaw: string | null = null;
  for (const k of wKeys) {
    if (attributes[k]) { weightRaw = attributes[k]; break; }
  }
  if (!weightRaw) {
    const text = stripHtml(html);
    const m = text.match(/\b(?:Gross\s+Weight|Net\s+Weight|Weight)\s*:\s*([\d.]+\s*(?:kg|kilograms?|g|grams?|lbs?|pounds?))/i);
    if (m) weightRaw = m[1];
  }
  const gross_weight_kg = parseWeightToKg(weightRaw);

  const category_path = findBreadcrumb(html);

  return { material, gross_weight_kg, category_path, attributes };
}

// ---------------------------------------------------------------------------
// Per-product enrichment
// ---------------------------------------------------------------------------

interface RowToEnrich {
  id: string;
  alibaba_product_id: string;
  alibaba_url: string | null;
  factory_id: string;
}

interface EnrichResult {
  id: string;
  status: "completed" | "failed" | "skipped";
  material?: string | null;
  gross_weight_kg?: number | null;
  category_path?: string[] | null;
  error?: string;
  duration_ms: number;
}

function detailUrlFor(row: RowToEnrich): string | null {
  if (row.alibaba_url) return row.alibaba_url;
  // Reconstruct from product id (Alibaba accepts the bare ID URL).
  if (row.alibaba_product_id) {
    return `https://www.alibaba.com/product-detail/_${row.alibaba_product_id}.html`;
  }
  return null;
}

async function enrichOne(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  row: RowToEnrich,
): Promise<EnrichResult> {
  const startedAt = Date.now();
  const url = detailUrlFor(row);
  if (!url) {
    return { id: row.id, status: "skipped", error: "no_detail_url", duration_ms: Date.now() - startedAt };
  }

  const fetched = await fetchWithCaptchaRetry(url, 2);
  if (!fetched.ok || !fetched.html) {
    return { id: row.id, status: "failed", error: `fetch_failed: ${fetched.reason}`, duration_ms: Date.now() - startedAt };
  }

  const parsed = parseDetailPage(fetched.html);

  // 1) factory_alibaba_products — write the raw enrichment.
  const { error: papError } = await supabase
    .from("factory_alibaba_products")
    .update({
      material: parsed.material,
      gross_weight_kg: parsed.gross_weight_kg,
      category_path: parsed.category_path,
      attributes: parsed.attributes,
      enriched_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("user_id", userId);

  if (papError) {
    return { id: row.id, status: "failed", error: `factory_alibaba_products: ${papError.message}`, duration_ms: Date.now() - startedAt };
  }

  // 2) sourceable_products — mirror into the columns the UI filters on.
  //    Category is only overwritten when NULL (per spec — keep title-keyword
  //    matches that already succeeded).
  const sourceableUpdate: Record<string, unknown> = {
    material: parsed.material,
    weight_kg: parsed.gross_weight_kg,
    updated_at: new Date().toISOString(),
  };

  const breadcrumbCategory = categoryFromBreadcrumb(parsed.category_path);
  if (breadcrumbCategory) {
    // Find the matching sourceable row to check whether its category is NULL.
    const { data: existing } = await supabase
      .from("sourceable_products")
      .select("id, category")
      .eq("factory_id", row.factory_id)
      .eq("alibaba_product_id", row.alibaba_product_id)
      .maybeSingle();
    if (existing && !(existing as { category: string | null }).category) {
      sourceableUpdate.category = breadcrumbCategory;
    }
  }

  const { error: spError } = await supabase
    .from("sourceable_products")
    .update(sourceableUpdate)
    .eq("source", "alibaba_crawl")
    .eq("factory_id", row.factory_id)
    .eq("alibaba_product_id", row.alibaba_product_id);

  if (spError) {
    // Non-fatal — we already wrote the raw data.
    console.warn("[enrich] sourceable_products mirror failed:", spError.message);
  }

  return {
    id: row.id,
    status: "completed",
    material: parsed.material,
    gross_weight_kg: parsed.gross_weight_kg,
    category_path: parsed.category_path,
    duration_ms: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Row selection
// ---------------------------------------------------------------------------

interface RequestBody {
  product_id?: string;
  product_ids?: string[];
  factory_id?: string;
  factory_ids?: string[];
  only_missing?: boolean;
  limit?: number;
}

async function selectRows(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: RequestBody,
): Promise<RowToEnrich[]> {
  const onlyMissing = body.only_missing ?? true;
  const limit = Math.min(
    Math.max(body.limit ?? MAX_PRODUCTS_PER_INVOCATION, 1),
    MAX_PRODUCTS_PER_INVOCATION,
  );

  let q = supabase
    .from("factory_alibaba_products")
    .select("id, alibaba_product_id, alibaba_url, factory_id")
    .eq("user_id", userId)
    .order("scraped_at", { ascending: false });

  if (body.product_id) {
    q = q.eq("id", body.product_id);
  } else if (body.product_ids && body.product_ids.length > 0) {
    q = q.in("id", body.product_ids);
  } else if (body.factory_id) {
    q = q.eq("factory_id", body.factory_id);
  } else if (body.factory_ids && body.factory_ids.length > 0) {
    q = q.in("factory_id", body.factory_ids);
  }

  if (onlyMissing) {
    q = q.is("enriched_at", null);
  }

  q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw new Error(`row_select_failed: ${error.message}`);
  return (data ?? []) as RowToEnrich[];
}

// ---------------------------------------------------------------------------
// Server entry
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    body = {};
  }

  let rows: RowToEnrich[];
  try {
    rows = await selectRows(supabase, user.id, body);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  if (rows.length === 0) {
    return json({
      success: true,
      summary: { selected: 0, completed: 0, failed: 0, skipped: 0 },
      results: [],
    });
  }

  const results: EnrichResult[] = [];
  for (const row of rows) {
    const r = await enrichOne(supabase, user.id, row);
    results.push(r);
  }

  const summary = {
    selected:  rows.length,
    completed: results.filter((r) => r.status === "completed").length,
    failed:    results.filter((r) => r.status === "failed").length,
    skipped:   results.filter((r) => r.status === "skipped").length,
  };

  return json({ success: true, summary, results });
});

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

// Switched from the generic `apify~website-content-crawler` to the
// alibaba-specialized `shareze001~scrape-alibaba-item` actor on
// 2026-05-18 after Supabase function logs confirmed every detail-page
// fetch was returning `captcha_persistent` (Alibaba blocks generic
// Playwright on product-detail.html). The specialized actor reads the
// embedded `window.__page_data_sse__` JSON, sidestepping the captcha
// wall, and returns structured properties (productBasicProperties /
// productKeyIndustryProperties / productOtherProperties) plus a
// `categories` array — no HTML parsing on our side.
const ACTOR_ID = "shareze001~scrape-alibaba-item";

// Per-invocation safety cap. The actor takes ~30–60s per URL on
// average; with one batched call carrying all chunk URLs we stay well
// under the 150s gateway timeout. Caller chunks to match.
const MAX_PRODUCTS_PER_INVOCATION = 2;

// ---------------------------------------------------------------------------
// Apify fetcher — alibaba-specialized actor, structured response
// ---------------------------------------------------------------------------

/**
 * Shape of one item returned by `shareze001~scrape-alibaba-item`. Field names
 * are taken from the actor docs; properties dictionaries are merged into our
 * `attributes` JSONB downstream. Anything we don't model is preserved by
 * stuffing into `attributes` so we can typed-extract more fields later
 * without a re-crawl.
 */
interface ApifyAlibabaProduct {
  url?: string;
  productId?: string;
  subject?: string;
  categories?: string[];
  mediaItems?: string[];
  moq?: string;
  price?: string;
  sku?: string;
  sample?: boolean;
  sampleInfo?: string;
  productHtmlDescription?: string;
  productBasicProperties?: Record<string, string>;
  productKeyIndustryProperties?: Record<string, string>;
  productOtherProperties?: Record<string, string>;
}

interface ApifyFetchResult {
  ok: boolean;
  products?: ApifyAlibabaProduct[];
  status?: number;
  reason?: string;
  diag?: unknown;
}

/**
 * Batch-fetch a chunk of detail URLs through the alibaba actor. One actor run
 * covers the entire chunk, which keeps us inside the 150s function timeout
 * (CHUNK_SIZE=2 client-side → 2 URLs → single run ≈ 60–120s).
 */
async function fetchProductsViaApify(urls: string[]): Promise<ApifyFetchResult> {
  if (!APIFY_TOKEN) return { ok: false, reason: "no_apify_token" };
  if (urls.length === 0) return { ok: true, products: [] };

  const apiUrl =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=130&memory=1024&format=json`;

  const input = {
    size: urls.length,
    detail_urls: urls,
    proxyConfiguration: { useApifyProxy: true },
  };

  const ac = new AbortController();
  // Give the actor ~135s wall-clock; gateway will still cap at 150s.
  const abortTimer = setTimeout(() => ac.abort(), 135_000);
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
  return { ok: true, products: items as ApifyAlibabaProduct[] };
}

// ---------------------------------------------------------------------------
// Structured response → DetailParseResult
// ---------------------------------------------------------------------------

interface DetailParseResult {
  material: string | null;
  gross_weight_kg: number | null;
  category_path: string[] | null;
  attributes: Record<string, string>;
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
 * Merge the three Alibaba properties objects into a single attributes
 * record. Order matters because we prefer values from the more specific
 * dictionaries on duplicate keys.
 */
function mergeAttributes(p: ApifyAlibabaProduct): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (src?: Record<string, string>) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      const key = String(k).trim().replace(/:$/, "").trim();
      const val = typeof v === "string" ? v.trim() : String(v);
      if (key && val && !(key in out)) out[key] = val;
    }
  };
  // Most specific first.
  put(p.productKeyIndustryProperties);
  put(p.productBasicProperties);
  put(p.productOtherProperties);
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

/**
 * Map one structured actor item to our DetailParseResult shape. The actor
 * already separates basic / industry / other properties, so we just merge
 * them, then pick the typed fields we care about by known key names.
 */
function parseAlibabaProduct(p: ApifyAlibabaProduct): DetailParseResult {
  const attributes = mergeAttributes(p);

  // Material: try known keys in priority order.
  const matKeys = ["Material", "Fabric Type", "Composition", "Main Fabric Composition", "Outer Material"];
  let material: string | null = null;
  for (const k of matKeys) {
    if (attributes[k]) { material = attributes[k]; break; }
  }

  // Weight: prefer "Gross Weight" over generic "Weight".
  const wKeys = ["Gross Weight", "Net Weight", "Weight", "Product Weight", "Package Weight"];
  let weightRaw: string | null = null;
  for (const k of wKeys) {
    if (attributes[k]) { weightRaw = attributes[k]; break; }
  }
  const gross_weight_kg = parseWeightToKg(weightRaw);

  // Categories array is structured by the actor; drop blank / "Home" / "Alibaba.com" leaves.
  const category_path = (() => {
    if (!p.categories || p.categories.length === 0) return null;
    const path = p.categories
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s && s.toLowerCase() !== "home" && s.toLowerCase() !== "alibaba.com");
    return path.length > 0 ? path : null;
  })();

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

/**
 * Persist a single row's enrichment given the actor's response object.
 * Caller already batched the actor fetch — this function handles only the
 * parse + 2 DB writes.
 */
async function persistOne(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  row: RowToEnrich,
  product: ApifyAlibabaProduct | undefined,
): Promise<EnrichResult> {
  const startedAt = Date.now();
  const tag = `[enrich:${row.alibaba_product_id}]`;

  if (!product) {
    console.log(`${tag} no_actor_item — actor returned no row for this URL`);
    return { id: row.id, status: "failed", error: "no_actor_item", duration_ms: Date.now() - startedAt };
  }

  const parsed = parseAlibabaProduct(product);
  console.log(
    `${tag} parsed: material=${JSON.stringify(parsed.material)}, weight=${parsed.gross_weight_kg}, ` +
    `category_path=${JSON.stringify(parsed.category_path)}, attr_keys=${JSON.stringify(Object.keys(parsed.attributes))}`,
  );

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
    console.log(`${tag} update_failed: ${papError.message}`);
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
  console.log(`[enrich] invocation start: body=${JSON.stringify(body)} user=${user.id}`);

  let rows: RowToEnrich[];
  try {
    rows = await selectRows(supabase, user.id, body);
  } catch (e) {
    console.log(`[enrich] row_select_failed: ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
  console.log(`[enrich] selected ${rows.length} rows: ${rows.map(r => r.alibaba_product_id).join(",")}`);

  if (rows.length === 0) {
    console.log(`[enrich] no rows to process — returning empty summary`);
    return json({
      success: true,
      summary: { selected: 0, completed: 0, failed: 0, skipped: 0 },
      results: [],
    });
  }

  // 1) Build the URL list for the actor. Rows missing a URL get a synthetic
  //    skip result and are not sent.
  const results: EnrichResult[] = [];
  const fetchTargets: Array<{ row: RowToEnrich; url: string }> = [];
  for (const row of rows) {
    const url = detailUrlFor(row);
    if (!url) {
      console.log(`[enrich:${row.alibaba_product_id}] skipped — no_detail_url`);
      results.push({ id: row.id, status: "skipped", error: "no_detail_url", duration_ms: 0 });
      continue;
    }
    fetchTargets.push({ row, url });
  }

  // 2) One batched actor call covers the whole chunk.
  let fetched: ApifyFetchResult = { ok: true, products: [] };
  if (fetchTargets.length > 0) {
    const urls = fetchTargets.map((t) => t.url);
    console.log(`[enrich] batched actor call for ${urls.length} URL(s)`);
    fetched = await fetchProductsViaApify(urls);
    // Always log status + diag too so HTTP failures (4xx/5xx) show what
    // Apify actually said (most useful for "apify_http_error" cases —
    // unknown actor / rental required / input schema rejected).
    console.log(
      `[enrich] actor result: ok=${fetched.ok}, reason=${fetched.reason ?? "n/a"}, ` +
      `items=${fetched.products?.length ?? 0}, status=${fetched.status ?? "n/a"}, ` +
      `diag=${typeof fetched.diag === "string" ? fetched.diag : JSON.stringify(fetched.diag ?? null)}`,
    );
  }

  if (!fetched.ok) {
    // Hard fail — every fetched target counts as failed with the same reason.
    const reason = `fetch_failed: ${fetched.reason}`;
    for (const t of fetchTargets) {
      results.push({ id: t.row.id, status: "failed", error: reason, duration_ms: 0 });
    }
  } else {
    // 3) Map each row to the actor item that matches its product ID (or URL).
    const byProductId = new Map<string, ApifyAlibabaProduct>();
    const byUrl       = new Map<string, ApifyAlibabaProduct>();
    for (const p of fetched.products ?? []) {
      if (p.productId) byProductId.set(String(p.productId), p);
      if (p.url)       byUrl.set(p.url, p);
    }
    for (const t of fetchTargets) {
      const match =
        byProductId.get(t.row.alibaba_product_id) ?? byUrl.get(t.url);
      const r = await persistOne(supabase, user.id, t.row, match);
      results.push(r);
    }
  }
  console.log(`[enrich] invocation done: results=${JSON.stringify(results)}`);

  const summary = {
    selected:  rows.length,
    completed: results.filter((r) => r.status === "completed").length,
    failed:    results.filter((r) => r.status === "failed").length,
    skipped:   results.filter((r) => r.status === "skipped").length,
  };

  return json({ success: true, summary, results });
});

// Backfill `factory_alibaba_products.main_image_url` for rows the
// listing crawl missed.
//
// Why this exists separately from `enrich-alibaba-product-details`:
//   - enrich uses the specialized `shareze001~scrape-alibaba-item` actor
//     for structured fields (material / weight / category). When that
//     actor fails (rental expired, schema change, etc.) the whole row
//     fails and the image isn't recovered either.
//   - This function depends ONLY on the generic
//     `apify~website-content-crawler` actor — the same actor we use in
//     `crawl-alibaba-products`, so we know it works for our token.
//   - Pulls the image from the detail page's `<meta property="og:image">`
//     tag, which Alibaba populates ~100% of the time for social sharing.
//
// Scope is intentionally narrow: this function touches ONLY
//   - factory_alibaba_products.main_image_url
//   - sourceable_products.image_url (mirror)
// It does NOT set `enriched_at`, `material`, `gross_weight_kg`,
// `category_path`, or `attributes` — that's the enrich function's job.
//
// Input (POST JSON body):
//   { product_id: UUID }                 -- one row
//   { product_ids: UUID[] }              -- a specific list
//   { factory_id: UUID }                 -- every NULL-image row for that factory
//   { factory_ids: UUID[] }              -- across multiple factories
// (Always implicitly filters to main_image_url IS NULL.)
//
// Auth: requires JWT, scoped via RLS like every other alibaba function.

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

// Each Apify run on a single URL averages ~30-60s. Two URLs sequential
// is ~120s, safely under the Supabase 150s gateway timeout.
const MAX_PRODUCTS_PER_INVOCATION = 2;

// ---------------------------------------------------------------------------
// Apify fetcher — fetches one detail page's HTML
// ---------------------------------------------------------------------------

interface ApifyFetchResult {
  ok: boolean;
  html?: string;
  status?: number;
  reason?: string;
  diag?: unknown;
}

async function fetchHtmlViaApify(detailUrl: string): Promise<ApifyFetchResult> {
  if (!APIFY_TOKEN) return { ok: false, reason: "no_apify_token" };

  const apiUrl =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=70&memory=2048&format=json`;

  // Detail page is mostly static — no need for the heavy lazy-scroll
  // postNavigationHooks the listing crawl uses. og:image is in the
  // initial HTML on page load.
  const input = {
    startUrls: [{ url: detailUrl }],
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
    maxRequestRetries: 2,
    requestTimeoutSecs: 60,
    pageLoadTimeoutSecs: 45,
    preNavigationHooks: `[
      async ({ page }) => {
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      }
    ]`,
  };

  const ac = new AbortController();
  const abortTimer = setTimeout(() => ac.abort(), 80_000);
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

// ---------------------------------------------------------------------------
// HTML parse — get the main product image URL
// ---------------------------------------------------------------------------

/**
 * Extract a representative image URL from an Alibaba product detail page.
 *
 * Priority:
 *   1. <meta property="og:image" content="..."> — Alibaba populates this
 *      ~100% of the time as the social-share preview image, and it's the
 *      cleanest signal.
 *   2. <meta name="twitter:image" content="..."> — same idea, fallback.
 *   3. First <img src="...alicdn.com..."> — last-resort heuristic.
 *
 * Returns null only if all three strategies fail (extremely rare).
 */
function extractMainImage(html: string): string | null {
  if (!html) return null;

  // 1) og:image
  const ogMatch =
    html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ??
    html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
  if (ogMatch) {
    let src = ogMatch[1].trim();
    if (src.startsWith("//")) src = "https:" + src;
    if (src) return src;
  }

  // 2) twitter:image
  const twMatch =
    html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i) ??
    html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']twitter:image["']/i);
  if (twMatch) {
    let src = twMatch[1].trim();
    if (src.startsWith("//")) src = "https:" + src;
    if (src) return src;
  }

  // 3) First alicdn img — heuristic.
  const imgMatch = html.match(/<img\b[^>]+\bsrc=["']((?:https?:)?\/\/[^"']*alicdn\.com\/[^"']+)["']/i);
  if (imgMatch) {
    let src = imgMatch[1].trim();
    if (src.startsWith("//")) src = "https:" + src;
    if (src) return src;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Row selection + persistence
// ---------------------------------------------------------------------------

interface RowToBackfill {
  id: string;
  alibaba_product_id: string;
  alibaba_url: string | null;
  factory_id: string;
}

interface BackfillResult {
  id: string;
  status: "completed" | "failed" | "skipped";
  image_url?: string | null;
  error?: string;
  duration_ms: number;
}

function detailUrlFor(row: RowToBackfill): string | null {
  if (row.alibaba_url) return row.alibaba_url;
  if (row.alibaba_product_id) {
    return `https://www.alibaba.com/product-detail/_${row.alibaba_product_id}.html`;
  }
  return null;
}

interface RequestBody {
  product_id?: string;
  product_ids?: string[];
  factory_id?: string;
  factory_ids?: string[];
  limit?: number;
}

async function selectRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  body: RequestBody,
): Promise<RowToBackfill[]> {
  const limit = Math.min(
    Math.max(body.limit ?? MAX_PRODUCTS_PER_INVOCATION, 1),
    MAX_PRODUCTS_PER_INVOCATION,
  );

  let q = supabase
    .from("factory_alibaba_products")
    .select("id, alibaba_product_id, alibaba_url, factory_id")
    .eq("user_id", userId)
    .is("main_image_url", null)
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

  q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw new Error(`row_select_failed: ${error.message}`);
  return (data ?? []) as RowToBackfill[];
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
  const userId = user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    body = {};
  }
  console.log(`[bf-img] invocation start: body=${JSON.stringify(body)} user=${user.id}`);

  let rows: RowToBackfill[];
  try {
    rows = await selectRows(supabase, user.id, body);
  } catch (e) {
    console.log(`[bf-img] row_select_failed: ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
  console.log(`[bf-img] selected ${rows.length} rows: ${rows.map((r) => r.alibaba_product_id).join(",")}`);

  if (rows.length === 0) {
    return json({
      success: true,
      summary: { selected: 0, completed: 0, failed: 0, skipped: 0 },
      results: [],
    });
  }

  const results: BackfillResult[] = [];

  // Sequential per row — each Apify call is ~30-60s, and we cap rows
  // per invocation at MAX_PRODUCTS_PER_INVOCATION so total stays under
  // the 150s gateway timeout.
  for (const row of rows) {
    const startedAt = Date.now();
    const tag = `[bf-img:${row.alibaba_product_id}]`;
    const url = detailUrlFor(row);
    if (!url) {
      console.log(`${tag} skipped — no_detail_url`);
      results.push({ id: row.id, status: "skipped", error: "no_detail_url", duration_ms: 0 });
      continue;
    }

    const fetched = await fetchHtmlViaApify(url);
    if (!fetched.ok || !fetched.html) {
      const errMsg = `fetch_failed: ${fetched.reason ?? "unknown"}`;
      console.log(`${tag} ${errMsg} diag=${JSON.stringify(fetched.diag ?? null)}`);
      results.push({ id: row.id, status: "failed", error: errMsg, duration_ms: Date.now() - startedAt });
      continue;
    }

    const imageUrl = extractMainImage(fetched.html);
    if (!imageUrl) {
      console.log(`${tag} no_image_found (html_len=${fetched.html.length})`);
      results.push({ id: row.id, status: "failed", error: "no_image_found", duration_ms: Date.now() - startedAt });
      continue;
    }
    console.log(`${tag} extracted og:image: ${imageUrl}`);

    // 1) factory_alibaba_products — only main_image_url.
    const { error: papError } = await supabase
      .from("factory_alibaba_products")
      .update({ main_image_url: imageUrl })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (papError) {
      console.log(`${tag} update_failed: ${papError.message}`);
      results.push({ id: row.id, status: "failed", error: `factory_alibaba_products: ${papError.message}`, duration_ms: Date.now() - startedAt });
      continue;
    }

    // 2) sourceable_products mirror — image_url + updated_at.
    const { error: spError } = await supabase
      .from("sourceable_products")
      .update({
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("source", "alibaba_crawl")
      .eq("factory_id", row.factory_id)
      .eq("alibaba_product_id", row.alibaba_product_id);

    if (spError) {
      // Non-fatal — alibaba table already has the image.
      console.warn(`${tag} sourceable_products mirror failed: ${spError.message}`);
    }

    results.push({
      id: row.id,
      status: "completed",
      image_url: imageUrl,
      duration_ms: Date.now() - startedAt,
    });
  }

  const summary = {
    selected:  rows.length,
    completed: results.filter((r) => r.status === "completed").length,
    failed:    results.filter((r) => r.status === "failed").length,
    skipped:   results.filter((r) => r.status === "skipped").length,
  };
  console.log(`[bf-img] invocation done: summary=${JSON.stringify(summary)}`);

  return json({ success: true, summary, results });
});

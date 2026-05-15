// Crawl the productlist.html page of an Alibaba.com supplier showroom via Apify
// and upsert rows into factory_alibaba_products.
//
// Input (POST JSON body):
//   { factory_id: UUID }                              -- crawl one factory
//   { factory_ids: UUID[] }                            -- crawl a specific list
//   { min_score?: number, limit?: number }             -- crawl all factories whose
//                                                       overall_score >= min_score
//                                                       (default 60)
//
// Auth: this endpoint requires a logged-in user (JWT). All writes are scoped
// to that user via RLS.
//
// Uses the same Apify pattern as crawl-alibaba-supplier (Playwright Chrome,
// US residential proxies, CAPTCHA-aware retry).

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
const DEFAULT_MIN_SCORE = 60;
const DEFAULT_FACTORY_LIMIT = 20;       // safety cap: how many factories per invocation
const MAX_PRODUCTS_PER_FACTORY = 60;    // safety cap: how many products from one page

// ---------------------------------------------------------------------------
// URL derivation
// ---------------------------------------------------------------------------

/** Turn supplier identifiers into a productlist URL. */
function deriveProductListUrl(factory: {
  alibaba_supplier_id: string | null;
  alibaba_url: string | null;
}): string | null {
  const sid = (factory.alibaba_supplier_id || "").trim().toLowerCase();
  if (sid) {
    return `https://${sid}.en.alibaba.com/productlist.html`;
  }
  // Fall back: extract the subdomain from alibaba_url if present.
  const url = (factory.alibaba_url || "").trim();
  const m = url.match(/https?:\/\/([a-z0-9_-]+)\.(?:en\.)?alibaba\.com/i);
  if (m) {
    return `https://${m[1].toLowerCase()}.en.alibaba.com/productlist.html`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CAPTCHA detection (same heuristic as crawl-alibaba-supplier)
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

// ---------------------------------------------------------------------------
// Apify fetcher
// ---------------------------------------------------------------------------

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
        // Wait for product cards to render. The supplier showroom uses
        // either .organic-list / .organic-gallery / .icbu-supplier-* classes
        // depending on the layout. Just wait a reasonable amount of time.
        await page.waitForTimeout(5000);
        try {
          await page.waitForSelector('a[href*="product-detail"]', { timeout: 10000 });
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
  attempts: number;
  captcha_hits: number;
}> {
  let captchaHits = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetchHtmlViaApify(url);
    if (!r.ok) {
      if (attempt < maxAttempts) { await sleep(2000); continue; }
      return { ok: false, reason: r.reason, attempts: attempt, captcha_hits: captchaHits };
    }
    if (!isCaptchaPage(r.html ?? "")) {
      return { ok: true, html: r.html, attempts: attempt, captcha_hits: captchaHits };
    }
    captchaHits++;
    if (attempt < maxAttempts) await sleep(2000);
  }
  return { ok: false, reason: "captcha_persistent", attempts: maxAttempts, captcha_hits: captchaHits };
}

// ---------------------------------------------------------------------------
// HTML parsing — extract products from a supplier productlist.html page
// ---------------------------------------------------------------------------

interface ParsedProduct {
  alibaba_product_id: string;
  alibaba_url: string | null;
  title: string | null;
  main_image_url: string | null;
  price_text: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  moq_text: string | null;
  moq_value: number | null;
  moq_unit: string | null;
  raw: Record<string, unknown>;
}

/** Extract a product ID from any alibaba product-detail URL. */
function extractProductId(href: string): string | null {
  // Patterns:
  //   /product-detail/Title_1234567890.html
  //   //www.alibaba.com/product-detail/Title_1234567890.html?...
  const m = href.match(/product-detail\/[^/?]*?_(\d{8,})\.html/);
  return m ? m[1] : null;
}

/** Parse a price-like string into min/max numeric values. */
function parsePrice(raw: string): { min: number | null; max: number | null; currency: string | null } {
  if (!raw) return { min: null, max: null, currency: null };
  // Strip currency symbols and "US ", normalize.
  const currencyMatch = raw.match(/US\s*\$|USD|\$|€|EUR|¥|CNY|RMB/i);
  const currency =
    currencyMatch
      ? (/€|EUR/i.test(currencyMatch[0]) ? "EUR"
        : /¥|CNY|RMB/i.test(currencyMatch[0]) ? "CNY"
        : "USD")
      : "USD";
  // Find numbers (with optional decimal and thousands separator).
  const nums = raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return { min: null, max: null, currency };
  const parsed = nums.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (parsed.length === 0) return { min: null, max: null, currency };
  if (parsed.length === 1) return { min: parsed[0], max: parsed[0], currency };
  return { min: Math.min(...parsed), max: Math.max(...parsed), currency };
}

/** Parse "Min. order: 10 sets" / "MOQ: 100 pieces" / "10 sets". */
function parseMoq(raw: string): { value: number | null; unit: string | null } {
  if (!raw) return { value: null, unit: null };
  const m = raw.match(/(\d[\d,]*)\s*([A-Za-z]+)/);
  if (!m) return { value: null, unit: null };
  const value = Number(m[1].replace(/,/g, ""));
  return { value: Number.isFinite(value) ? value : null, unit: m[2].toLowerCase() };
}

// HTML entity decoder for the small set Alibaba uses in attribute values.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Look at a single anchor's outer HTML (the full `<a ...>...</a>` string) and
 * pull every signal we can find for its title. Returns the best candidate or
 * null. Priority order:
 *   1. `title="..."` on the anchor itself
 *   2. `aria-label="..."` on the anchor
 *   3. `alt="..."` from any nested <img>
 *   4. `title="..."` from any nested element
 *   5. Visible text content inside the anchor (tags stripped)
 */
function extractTitleFromAnchor(outerHtml: string, innerHtml: string): string | null {
  const tryPatterns: RegExp[] = [
    /^<a\b[^>]*\stitle="([^"]+)"/i,         // title on the anchor
    /^<a\b[^>]*\saria-label="([^"]+)"/i,    // aria-label on the anchor
    /<img\b[^>]*\salt="([^"]+)"/i,          // image alt
    /<[a-z][a-z0-9]*\b[^>]*\stitle="([^"]+)"/i, // title on any nested element
  ];
  for (const re of tryPatterns) {
    const m = (re.test(outerHtml) ? outerHtml : innerHtml).match(re);
    if (m && m[1]) {
      const t = decodeHtmlEntities(m[1]).trim();
      if (t.length > 0 && t.length < 300) return t;
    }
  }
  // Fall back to stripped inner text.
  const stripped = innerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (stripped.length > 2 && stripped.length < 300) return decodeHtmlEntities(stripped);
  return null;
}

/**
 * Parse the HTML of an Alibaba supplier productlist.html page.
 *
 * Alibaba serves multiple layouts for showrooms; this parser is intentionally
 * tolerant. It finds every anchor pointing at /product-detail/..._<id>.html
 * and *merges* the signals across all anchors for the same product ID — the
 * image-only anchor and the title-only anchor are both contributions.
 */
function parseProductList(html: string, sourceUrl: string): ParsedProduct[] {
  if (!html) return [];

  // Find every anchor referencing a product-detail page.
  // The outer match group is the whole anchor; we need it because some title
  // signals (title=, aria-label=) live on the anchor tag itself.
  const anchorRe = /(<a\b[^>]*href="([^"]*product-detail\/[^"]+?_(\d{8,})\.html[^"]*)"[^>]*>([\s\S]{0,2000}?)<\/a>)/gi;

  const seen = new Map<string, ParsedProduct>();
  let totalAnchorsSeen = 0;

  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    totalAnchorsSeen++;
    const outerHtml = match[1];
    const rawHref = match[2];
    const productId = match[3];
    const innerHtml = match[4] || "";

    // Try every title extraction strategy on this anchor.
    const candidateTitle = extractTitleFromAnchor(outerHtml, innerHtml);

    // Image src — look inside the anchor.
    const imgMatch = innerHtml.match(/<img\b[^>]+\b(?:data-src|src)="([^"]+)"/i);
    let mainImage: string | null = imgMatch ? imgMatch[1] : null;
    if (mainImage && mainImage.startsWith("//")) mainImage = "https:" + mainImage;

    // Build the absolute URL once (first anchor wins, but all should match).
    let absUrl: string | null = rawHref;
    if (absUrl && absUrl.startsWith("//")) absUrl = "https:" + absUrl;
    else if (absUrl && absUrl.startsWith("/")) absUrl = "https://www.alibaba.com" + absUrl;

    const existing = seen.get(productId);
    if (existing) {
      // Merge — fill in whichever fields the previous anchor didn't have.
      if (!existing.title && candidateTitle) existing.title = candidateTitle;
      if (!existing.main_image_url && mainImage) existing.main_image_url = mainImage;
      if (!existing.alibaba_url && absUrl) existing.alibaba_url = absUrl;
      // Track in raw_data that more than one anchor contributed.
      const anchors = (existing.raw.anchors as number | undefined) ?? 1;
      existing.raw.anchors = anchors + 1;
      continue;
    }

    seen.set(productId, {
      alibaba_product_id: productId,
      alibaba_url: absUrl,
      title: candidateTitle,
      main_image_url: mainImage,
      price_text: null,
      price_min: null,
      price_max: null,
      currency: null,
      moq_text: null,
      moq_value: null,
      moq_unit: null,
      raw: {
        rawHref,
        anchors: 1,
        innerHtmlSample: innerHtml.slice(0, 500),
        outerHtmlSample: outerHtml.slice(0, 800),
      },
    });
  }

  console.log(
    `[parse] total anchors=${totalAnchorsSeen}, unique products=${seen.size}`,
  );

  // Pull prices / MOQ by scanning the surrounding 4000 chars around each anchor.
  // (Alibaba showrooms vary — sometimes price is in the card, sometimes a sibling.)
  for (const [pid, prod] of seen.entries()) {
    const idx = html.indexOf(pid);
    if (idx < 0) continue;
    const start = Math.max(0, idx - 2000);
    const end = Math.min(html.length, idx + 2000);
    const window = html.slice(start, end);

    const priceMatch = window.match(/(?:US\s*\$|USD\s*|\$)[\d,]+(?:\.\d+)?(?:\s*-\s*[\d,]+(?:\.\d+)?)?/);
    if (priceMatch) {
      prod.price_text = priceMatch[0].trim();
      const parsed = parsePrice(prod.price_text);
      prod.price_min = parsed.min;
      prod.price_max = parsed.max;
      prod.currency = parsed.currency;
    }

    const moqMatch = window.match(/(?:Min\.?\s*order|MOQ)[^<\n]{0,80}?\d+[\d,]*\s*[A-Za-z]+/i);
    if (moqMatch) {
      prod.moq_text = moqMatch[0].replace(/\s+/g, " ").trim();
      const parsed = parseMoq(prod.moq_text);
      prod.moq_value = parsed.value;
      prod.moq_unit = parsed.unit;
    }
  }

  return Array.from(seen.values()).slice(0, MAX_PRODUCTS_PER_FACTORY).map((p) => ({
    ...p,
    raw: { ...p.raw, sourceUrl },
  }));
}

// ---------------------------------------------------------------------------
// Main per-factory worker
// ---------------------------------------------------------------------------

interface FactoryRow {
  id: string;
  name: string;
  alibaba_supplier_id: string | null;
  alibaba_url: string | null;
}

interface CrawlOneResult {
  factory_id: string;
  status: "completed" | "failed" | "skipped";
  records_synced: number;
  error_message?: string;
  source_page?: string;
  duration_ms: number;
}

async function crawlOneFactory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  factory: FactoryRow,
): Promise<CrawlOneResult> {
  const startedAt = Date.now();
  const sourcePage = deriveProductListUrl(factory);

  // Create a log row up-front so we can update it at the end.
  const { data: logRow, error: logError } = await supabase
    .from("factory_alibaba_crawl_logs")
    .insert({
      user_id: userId,
      factory_id: factory.id,
      status: "in_progress",
      source_page: sourcePage,
    })
    .select("id")
    .single();

  const logId = logError ? null : (logRow as { id: string }).id;

  const finish = async (status: CrawlOneResult["status"], recordsSynced: number, errorMessage?: string) => {
    const duration_ms = Date.now() - startedAt;
    if (logId) {
      await supabase
        .from("factory_alibaba_crawl_logs")
        .update({
          status,
          records_synced: recordsSynced,
          error_message: errorMessage ?? null,
          finished_at: new Date().toISOString(),
          duration_ms,
        })
        .eq("id", logId);
    }
    return {
      factory_id: factory.id,
      status,
      records_synced: recordsSynced,
      error_message: errorMessage,
      source_page: sourcePage ?? undefined,
      duration_ms,
    };
  };

  if (!sourcePage) {
    return finish("skipped", 0, "no alibaba_supplier_id or alibaba_url");
  }

  // Fetch via Apify with CAPTCHA-aware retry.
  const fetched = await fetchWithCaptchaRetry(sourcePage, 2);
  if (!fetched.ok || !fetched.html) {
    return finish("failed", 0, `fetch_failed: ${fetched.reason ?? "unknown"}`);
  }

  const products = parseProductList(fetched.html, sourcePage);
  if (products.length === 0) {
    return finish("completed", 0, "no products parsed");
  }

  // Upsert into factory_alibaba_products. UNIQUE(factory_id, alibaba_product_id)
  // means re-crawl updates the existing row rather than inserting a duplicate.
  const rows = products.map((p) => ({
    user_id: userId,
    factory_id: factory.id,
    alibaba_product_id: p.alibaba_product_id,
    alibaba_url: p.alibaba_url,
    title: p.title,
    main_image_url: p.main_image_url,
    price_text: p.price_text,
    price_min: p.price_min,
    price_max: p.price_max,
    currency: p.currency,
    moq_text: p.moq_text,
    moq_value: p.moq_value,
    moq_unit: p.moq_unit,
    raw_data: p.raw,
    source_page: sourcePage,
    scraped_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("factory_alibaba_products")
    .upsert(rows, { onConflict: "factory_id,alibaba_product_id" });

  if (upsertError) {
    return finish("failed", 0, `db_upsert_failed: ${upsertError.message}`);
  }

  return finish("completed", rows.length);
}

// ---------------------------------------------------------------------------
// Factory selection (which rows to crawl in this invocation)
// ---------------------------------------------------------------------------

async function selectFactories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  body: {
    factory_id?: string;
    factory_ids?: string[];
    min_score?: number;
    limit?: number;
  },
): Promise<{ ok: boolean; rows?: FactoryRow[]; error?: string }> {
  const query = supabase
    .from("factories")
    .select("id, name, alibaba_supplier_id, alibaba_url")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (body.factory_id) {
    const { data, error } = await query.eq("id", body.factory_id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (data ?? []) as FactoryRow[] };
  }

  if (body.factory_ids && body.factory_ids.length > 0) {
    const { data, error } = await query.in("id", body.factory_ids);
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (data ?? []) as FactoryRow[] };
  }

  // We filter by `stock_score` (the "재고 점수" shown in the factory list UI)
  // because `overall_score` is rarely populated on this project. If callers
  // want a different signal they can pass factory_id / factory_ids directly.
  const minScore = body.min_score ?? DEFAULT_MIN_SCORE;
  const limit = body.limit ?? DEFAULT_FACTORY_LIMIT;
  const { data, error } = await query
    .gte("stock_score", minScore)
    .order("stock_score", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as FactoryRow[] };
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  // Parse body
  let body: {
    factory_id?: string;
    factory_ids?: string[];
    min_score?: number;
    limit?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — default behavior crawls top-N factories with score >= 60.
  }

  // Select factories
  const selection = await selectFactories(supabase, user.id, body);
  if (!selection.ok) return json({ error: selection.error }, 500);
  const rows = selection.rows ?? [];
  if (rows.length === 0) {
    return json({
      success: true,
      message: "No factories matched the selection criteria",
      summary: { selected: 0, completed: 0, failed: 0, skipped: 0, total_records: 0 },
      results: [],
    });
  }

  // Sequential to avoid hammering Alibaba / Apify too hard from a single function.
  const results: CrawlOneResult[] = [];
  let totalRecords = 0;
  for (const factory of rows) {
    try {
      const r = await crawlOneFactory(supabase, user.id, factory);
      results.push(r);
      totalRecords += r.records_synced;
    } catch (err) {
      results.push({
        factory_id: factory.id,
        status: "failed",
        records_synced: 0,
        error_message: err instanceof Error ? err.message : String(err),
        duration_ms: 0,
      });
    }
  }

  const summary = {
    selected: rows.length,
    completed: results.filter((r) => r.status === "completed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    total_records: totalRecords,
  };

  return json({ success: true, summary, results });
});

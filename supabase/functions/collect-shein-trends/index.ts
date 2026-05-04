// Edge Function: collect-shein-trends
// Calls Apify's Shein Product Scraper for each category and stores results in trend_analyses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CATEGORIES = [
  { name: "Best Sellers", url: "https://us.shein.com/bestsellers/Best-Sellers-sc-01187485.html" },
  { name: "New In", url: "https://us.shein.com/New-in-sc-00654187.html" },
  { name: "Dresses", url: "https://us.shein.com/Women-Dresses-c-1727.html" },
  { name: "Tops", url: "https://us.shein.com/Women-Tops-c-1766.html" },
  { name: "Clothing", url: "https://us.shein.com/Women-Clothing-c-2030.html" },
];

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function runSheinScraper(categoryUrl: string, limit = 20): Promise<any[]> {
  console.log(`[Shein] Starting Apify run for: ${categoryUrl}, limit: ${limit}`);

  const runPayload = {
    startUrl: categoryUrl,
    results_wanted: limit,
  };
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/shahidirfan~shein-product-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(runPayload),
    },
  );

  if (!runRes.ok) {
    const errorBody = await runRes.text();
    console.error(
      `[Shein] Apify run start failed: status=${runRes.status}, body=${errorBody}, url=${categoryUrl}`,
    );
    throw new Error(`Apify run start failed: ${runRes.status} ${errorBody}`);
  }

  const run = await runRes.json();
  const runId = run.data.id;
  const datasetId = run.data.defaultDatasetId;
  let status = run.data.status;
  let lastCheckData: any = run;
  console.log(`[Shein] Apify run started: runId=${runId}, status=${status}`);

  let attempts = 0;
  const MAX_ATTEMPTS = 30; // 30 × 3s = 90s
  while (
    status !== "SUCCEEDED" &&
    status !== "FAILED" &&
    status !== "ABORTED" &&
    status !== "TIMED-OUT" &&
    status !== "TIMING-OUT" &&
    attempts < MAX_ATTEMPTS
  ) {
    await new Promise((r) => setTimeout(r, 3000));
    const checkRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
    );
    const checkData = await checkRes.json();
    lastCheckData = checkData;
    status = checkData.data.status;
    attempts++;
    console.log(`[Shein] Polling attempt ${attempts}: status=${status}`);
  }

  if (status === "FAILED" || status === "TIMED-OUT" || status === "TIMING-OUT" || status === "ABORTED") {
    const msg = lastCheckData?.data?.statusMessage || lastCheckData?.data?.exitCode || "unknown";
    console.error(`[Shein] Apify run ended with status=${status}, message=${msg}, runId=${runId}, url=${categoryUrl}`);
    throw new Error(`Apify run failed with status: ${status} (${msg})`);
  }

  if (status !== "SUCCEEDED") {
    console.error(
      `[Shein] Polling timed out after ${MAX_ATTEMPTS} attempts (${MAX_ATTEMPTS * 3}s), last status=${status}, runId=${runId}, url=${categoryUrl}`,
    );
    throw new Error(`Apify run polling timed out (last status: ${status})`);
  }

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`,
  );
  if (!itemsRes.ok) {
    const errBody = await itemsRes.text();
    console.error(`[Shein] Dataset fetch failed: ${itemsRes.status} ${errBody}`);
    throw new Error(`Apify dataset fetch failed: ${itemsRes.status}`);
  }
  const items = await itemsRes.json();
  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`[Shein] ${categoryUrl} returned 0 items`);
  } else {
    console.log(`[Shein] Got ${items.length} items from dataset ${datasetId}`);
    console.log(`[Shein] Apify item keys:`, Object.keys(items[0]));
    console.log(`[Shein] Sample item:`, JSON.stringify(items[0]).substring(0, 500));
  }
  return items;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!APIFY_TOKEN) {
      return new Response(
        JSON.stringify({ error: "APIFY_API_TOKEN not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestedCategories: string[] | undefined = body?.categories;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load shein collection settings (categories from DB; fallback to defaults)
    const { data: settingsRow } = await supabase
      .from("collection_settings")
      .select("is_enabled, category_urls, collect_limit")
      .eq("source_type", "shein")
      .maybeSingle();

    if (settingsRow?.is_enabled === false) {
      return new Response(
        JSON.stringify({ collected: 0, skipped: true, message: "shein collection is disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dbCategories = Array.isArray(settingsRow?.category_urls) && settingsRow!.category_urls.length > 0
      ? (settingsRow!.category_urls as Array<{ name: string; url: string }>)
      : DEFAULT_CATEGORIES;
    const sheinLimit = settingsRow?.collect_limit || 20;

    const categoriesToRun = requestedCategories?.length
      ? dbCategories.filter((c) => requestedCategories.includes(c.name))
      : dbCategories;

    if (categoriesToRun.length === 0) {
      return new Response(
        JSON.stringify({ error: "No matching categories" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // System user for trend_analyses.user_id (NOT NULL). Reuse first admin if available.
    let systemUserId: string | null = null;
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (adminRow?.user_id) systemUserId = adminRow.user_id as string;

    if (!systemUserId) {
      return new Response(
        JSON.stringify({ error: "No admin user found to attribute trends to" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const perCategory: Record<string, number> = {};
    let totalCollected = 0;

    for (const cat of categoriesToRun) {
      try {
        const products = await runSheinScraper(cat.url, sheinLimit);

        const trendRows = products.map((p: any) => {
          const title = p.goods_name || p.title || "Untitled";
          const url = p.url || cat.url;
          const image =
            p.goods_img ||
            p.image_url ||
            (Array.isArray(p.detail_image) && p.detail_image[0]) ||
            null;
          const parsePrice = (v: any): number | null => {
            if (v == null) return null;
            if (typeof v === "number") return v;
            if (typeof v === "string") {
              const n = parseFloat(v.replace(/[^\d.]/g, ""));
              return isNaN(n) ? null : n;
            }
            if (typeof v === "object") {
              return parsePrice(v.amount ?? v.amountWithSymbol ?? v.value ?? v.usdAmount);
            }
            return null;
          };
          const salePrice = parsePrice(p.salePrice ?? p.sale_price);
          const retailPrice = parsePrice(p.retailPrice ?? p.retail_price ?? p.original_price);

          return {
            user_id: systemUserId,
            status: "pending",
            trend_keywords: [title].filter(Boolean),
            trend_categories: [cat.name],
            source_data: {
              platform: "shein",
              source_type: "shein",
              title,
              source_url: url,
              image_url: image,
              category: cat.name,
              category_id: p.category_id || null,
              price: salePrice,
              original_price: retailPrice,
              discount_text: p.discount_text || null,
              product_id: p.goods_id || p.product_id || null,
              sku: p.sku || null,
              brand: p.brand || null,
              rating: p.rating ? parseFloat(p.rating) : null,
              reviews_count: p.reviews_count ? parseInt(p.reviews_count) : null,
              currency: p.currency || "USD",
              raw: p,
            },
          };
        });

        console.log(`[Shein] Inserting ${trendRows.length} rows for category: ${cat.name}`);
        if (trendRows.length > 0) {
          console.log(
            `[Shein] Sample row:`,
            JSON.stringify(trendRows[0]).substring(0, 300),
          );
          const { error } = await supabase.from("trend_analyses").insert(trendRows);
          if (error) {
            console.error(`Insert error for ${cat.name}:`, error);
            perCategory[cat.name] = 0;
            continue;
          }
        }

        perCategory[cat.name] = trendRows.length;
        totalCollected += trendRows.length;
      } catch (err) {
        console.error(`Category ${cat.name} failed:`, err);
        perCategory[cat.name] = 0;
      }
    }

    // Trigger embedding generation for newly inserted Shein trends
    let embeddingTriggered = false;
    try {
      const { data: unembedded } = await supabase
        .from("trend_analyses")
        .select("id")
        .eq("source_data->>platform", "shein")
        .is("embedding", null)
        .limit(50);

      if (unembedded && unembedded.length > 0) {
        await supabase.functions.invoke("generate-embedding", {
          body: { table: "trend_analyses", batch: true },
        });
        embeddingTriggered = true;
      }
    } catch (embedErr) {
      console.error("Embedding trigger failed:", embedErr);
    }

    return new Response(
      JSON.stringify({ collected: totalCollected, categories: perCategory, embeddingTriggered }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("collect-shein-trends fatal:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

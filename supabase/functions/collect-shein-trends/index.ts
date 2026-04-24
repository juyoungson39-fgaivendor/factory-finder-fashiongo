// Edge Function: collect-shein-trends
// Calls Apify's Shein Product Scraper for each category and stores results in trend_analyses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CATEGORIES = [
  { name: "Best Sellers", url: "https://us.shein.com/Fashion/Best-Sellers-sc-01327876.html" },
  { name: "Dresses", url: "https://us.shein.com/Women-Dresses-c-12472.html" },
  { name: "Tops", url: "https://us.shein.com/category/TOPS-sc-008176027.html" },
  { name: "Clothing", url: "https://us.shein.com/Clothing-c-2030.html" },
  { name: "Top Rated", url: "https://us.shein.com/hotsale/Women-top-rated-sc-003161153.html" },
];

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function runSheinScraper(categoryUrl: string, limit = 20): Promise<any[]> {
  console.log(`[Shein] Starting Apify run for: ${categoryUrl}, limit: ${limit}`);

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/shahidirfan~shein-product-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrl: categoryUrl,
        results_wanted: limit,
      }),
    },
  );

  if (!runRes.ok) {
    throw new Error(`Apify run start failed: ${runRes.status} ${await runRes.text()}`);
  }

  const run = await runRes.json();
  const runId = run.data.id;
  const datasetId = run.data.defaultDatasetId;
  let status = run.data.status;
  console.log(`[Shein] Apify run started: runId=${runId}, status=${status}`);

  let attempts = 0;
  const MAX_ATTEMPTS = 30; // 30 × 3s = 90s
  while (
    status !== "SUCCEEDED" &&
    status !== "FAILED" &&
    status !== "ABORTED" &&
    attempts < MAX_ATTEMPTS
  ) {
    await new Promise((r) => setTimeout(r, 3000));
    const checkRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
    );
    const checkData = await checkRes.json();
    status = checkData.data.status;
    attempts++;
    console.log(`[Shein] Polling attempt ${attempts}: status=${status}`);
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run failed with status: ${status}`);
  }

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`,
  );
  if (!itemsRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${itemsRes.status}`);
  }
  const items = await itemsRes.json();
  console.log(`[Shein] Got ${items.length} items from dataset ${datasetId}`);
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

    const categoriesToRun = requestedCategories?.length
      ? DEFAULT_CATEGORIES.filter((c) => requestedCategories.includes(c.name))
      : DEFAULT_CATEGORIES;

    if (categoriesToRun.length === 0) {
      return new Response(
        JSON.stringify({ error: "No matching categories" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
        const products = await runSheinScraper(cat.url, 20);

        const trendRows = products.map((p: any) => {
          const title = p.goods_name || p.title || "Untitled";
          const url = p.url || cat.url;
          const image =
            p.goods_img ||
            p.image_url ||
            (Array.isArray(p.detail_image) && p.detail_image[0]) ||
            null;
          const salePrice = p.salePrice?.amount ? parseFloat(p.salePrice.amount) : null;
          const retailPrice = p.retailPrice?.amount ? parseFloat(p.retailPrice.amount) : null;

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
          body: { mode: "batch" },
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

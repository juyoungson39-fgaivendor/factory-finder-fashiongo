// Edge Function: collect-shein-trends
// Calls Apify's Shein Product Scraper for each category and stores results in trend_analyses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CATEGORIES = [
  { name: "Dresses", url: "https://us.shein.com/Women-Dresses-c-1727.html?sort=9" },
  { name: "Tops", url: "https://us.shein.com/Women-Tops-c-1766.html?sort=9" },
  { name: "Bottoms", url: "https://us.shein.com/Women-Bottoms-c-1740.html?sort=9" },
  { name: "Outerwear", url: "https://us.shein.com/Women-Outerwear-c-1735.html?sort=9" },
  { name: "Shoes", url: "https://us.shein.com/Women-Shoes-c-1745.html?sort=9" },
];

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function runSheinScraper(categoryUrl: string, limit = 30): Promise<any[]> {
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/shahidirfan~shein-product-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: categoryUrl }],
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
  let attempts = 0;

  while (status !== "SUCCEEDED" && status !== "FAILED" && status !== "ABORTED" && attempts < 24) {
    await new Promise((r) => setTimeout(r, 5000));
    const checkRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
    );
    const checkData = await checkRes.json();
    status = checkData.data.status;
    attempts++;
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
  return await itemsRes.json();
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
        const products = await runSheinScraper(cat.url, 30);

        const trendRows = products.map((p: any) => {
          const title = p.title || p.name || p.goods_name || "Untitled";
          const url = p.url || p.link || p.goods_url || cat.url;
          const image = p.image || p.mainImage || p.images?.[0] || p.goods_img || null;
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
              price: p.price ?? p.salePrice ?? null,
              original_price: p.originalPrice ?? p.retailPrice ?? null,
              discount: p.discount ?? p.discountPercentage ?? null,
              product_id: p.productId ?? p.goods_id ?? null,
              platform_category: p.category ?? null,
              ratings: p.rating ?? p.star ?? null,
              reviews_count: p.reviewsCount ?? p.comment_num ?? null,
              sales_label: p.salesLabel ?? p.sellCountStr ?? null,
              raw: p,
            },
          };
        });

        if (trendRows.length > 0) {
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

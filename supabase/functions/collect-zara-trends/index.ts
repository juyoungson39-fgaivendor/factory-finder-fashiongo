// Edge Function: collect-zara-trends
// Calls Apify's Zara scraper for keyword(s), maps results into trend_analyses,
// dedupes by post_id, then fires analyze-trend for new rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { STOP_WORDS } from "../_shared/keyword-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEFAULT_KEYWORDS = [
  "new arrivals women",
  "trending now",
  "best sellers women",
];

const STOPWORDS = STOP_WORDS;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractKeywords(item: any): string[] {
  const out: string[] = [];
  const name: string = String(item?.name ?? "").toLowerCase();
  const tokens = name
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 1 && !STOPWORDS.has(w));
  for (const t of tokens) {
    if (!out.includes(t)) out.push(t);
    if (out.length >= 6) break;
  }
  if (item?.section && !out.includes(String(item.section).toLowerCase())) {
    out.push(String(item.section).toLowerCase());
  }
  if (item?.color && !out.includes(String(item.color).toLowerCase())) {
    out.push(String(item.color).toLowerCase());
  }
  return out.slice(0, 8);
}

async function runZaraScraper(keyword: string, maxItems: number): Promise<any[]> {
  console.log(`[Zara] Apify run start: keyword="${keyword}", max=${maxItems}`);
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/karamelo~zara-scraper/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchItems: [keyword],
        section: "WOMAN",
        countryAndLanguage: "us-en_US",
        maxItems,
      }),
    },
  );
  if (!runRes.ok) {
    throw new Error(
      `Apify run start failed: ${runRes.status} ${await runRes.text()}`,
    );
  }
  const run = await runRes.json();
  const runId = run.data.id;
  const datasetId = run.data.defaultDatasetId;
  let status = run.data.status;

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
    console.log(`[Zara] Polling ${attempts}: status=${status}`);
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run failed with status: ${status}`);
  }

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`,
  );
  if (!itemsRes.ok) throw new Error(`Apify dataset fetch failed: ${itemsRes.status}`);
  const items = await itemsRes.json();
  console.log(`[Zara] Got ${items.length} items from dataset ${datasetId}`);
  return items;
}

function mapZaraToRow(item: any, userId: string) {
  const postId = `zara_${item?.id ?? item?.reference ?? crypto.randomUUID()}`;
  const title = item?.name ?? "Untitled";
  const image =
    (Array.isArray(item?.images) && item.images[0]) ||
    item?.image ||
    null;
  const sourceUrl =
    item?.url ||
    `https://www.zara.com/us/en/${item?.seo?.keyword ?? ""}`;
  const price =
    typeof item?.price === "number"
      ? item.price
      : (item?.price?.value?.current?.amount ?? null);

  return {
    user_id: userId,
    status: "pending",
    trend_keywords: extractKeywords(item),
    source_data: {
      platform: "zara",
      source_type: "zara",
      post_id: postId,
      title,
      caption: `${title} - ${item?.section ?? "WOMAN"} - ${item?.color ?? ""} - $${price ?? ""}`,
      source_url: sourceUrl,
      image_url: image,
      source_account: "zara_official",
      section: item?.section ?? "WOMAN",
      color: item?.color ?? null,
      price,
      currency: "USD",
      raw: item,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  try {
    if (!APIFY_TOKEN) {
      return jsonResponse({ error: "APIFY_API_TOKEN not configured" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const requestedUserId: string | undefined = body?.user_id;
    const limit: number = Number(body?.limit ?? 20);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Settings: keywords + enabled flag
    const { data: settingsRow } = await supabase
      .from("collection_settings")
      .select("is_enabled, keywords, collect_limit")
      .eq("source_type", "zara")
      .maybeSingle();

    if (settingsRow?.is_enabled === false) {
      return jsonResponse({
        source: "zara",
        collected: 0,
        skipped: true,
        message: "zara collection is disabled",
      });
    }

    const keywords =
      Array.isArray(settingsRow?.keywords) && settingsRow!.keywords.length > 0
        ? (settingsRow!.keywords as string[])
        : DEFAULT_KEYWORDS;
    const keyword = pickRandom(keywords);
    const maxItems = settingsRow?.collect_limit || limit || 20;

    // Resolve user_id: requested or first admin (NOT NULL)
    let userId = requestedUserId ?? null;
    if (!userId) {
      const { data: adminRow } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      userId = (adminRow?.user_id as string) ?? null;
    }
    if (!userId) {
      return jsonResponse({ error: "No user_id available for trend ownership" }, 500);
    }

    // 1) Run scraper
    const items = await runZaraScraper(keyword, maxItems);
    const totalFetched = items.length;

    // 2) Map to rows
    const rows = items.map((it: any) => mapZaraToRow(it, userId!));
    const incomingPostIds = rows
      .map((r) => r.source_data.post_id as string)
      .filter(Boolean);

    // 3) Dedupe against existing zara post_ids
    let existing: Set<string> = new Set();
    if (incomingPostIds.length > 0) {
      const { data: existingRows } = await supabase
        .from("trend_analyses")
        .select("source_data")
        .eq("source_data->>platform", "zara")
        .in("source_data->>post_id", incomingPostIds);
      existing = new Set(
        (existingRows ?? [])
          .map((r: any) => r?.source_data?.post_id)
          .filter(Boolean),
      );
    }

    const newRows = rows.filter(
      (r) => !existing.has(r.source_data.post_id as string),
    );
    const duplicateCount = rows.length - newRows.length;

    let inserted: { id: string }[] = [];
    if (newRows.length > 0) {
      const { data, error } = await supabase
        .from("trend_analyses")
        .insert(newRows)
        .select("id");
      if (error) {
        console.error("[Zara] insert error:", error);
        return jsonResponse({ error: error.message }, 500);
      }
      inserted = data ?? [];
    }

    // 4) Fire-and-forget analyze-trend for each new row
    for (const row of inserted) {
      fetch(`${SUPABASE_URL}/functions/v1/analyze-trend`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trend_id: row.id }),
      }).catch(() => {});
    }

    return jsonResponse({
      source: "zara",
      collected: inserted.length,
      skipped_duplicates: duplicateCount,
      total_fetched: totalFetched,
      keyword,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("collect-zara-trends fatal:", message);
    return jsonResponse({ error: message }, 500);
  }
});

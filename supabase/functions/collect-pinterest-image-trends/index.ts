// Edge Function: collect-pinterest-image-trends
// Apify automation-lab/pinterest-scraper 기반으로 Pinterest 핀을 수집하여
// trend_analyses 테이블에 저장합니다.
// batch-pipeline 에서 { user_id, limit } 바디로 호출됩니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN");
const ACTOR_ID = "automation-lab~pinterest-scraper";

const DEFAULT_KEYWORDS = [
  "women's boutique outfit inspiration",
  "online boutique new arrivals fashion",
  "boutique style OOTD women's clothing",
  "shop small boutique finds style inspo",
  "summer 2026 fashion trends women",
  "spring outfit ideas wholesale",
  "trendy streetwear women 2026",
  "modest fashion wholesale boutique",
];

// ─── collection_settings에서 pinterest 설정 읽기 ──────────────
async function getCollectionSettings(supabase: any) {
  const { data, error } = await supabase
    .from("collection_settings")
    .select("is_enabled, keywords, collect_limit")
    .eq("source_type", "pinterest")
    .maybeSingle();

  if (error || !data) {
    console.warn("[Pinterest] No collection_settings found, using defaults");
    return { is_enabled: true, keywords: DEFAULT_KEYWORDS, collect_limit: 20 };
  }
  return data as { is_enabled: boolean; keywords: string[]; collect_limit: number };
}

// ─── Apify Actor 실행 + 폴링 + 결과 반환 ─────────────────────
async function runPinterestScraper(keywords: string[], maxPins: number): Promise<any[]> {
  console.log(`[Pinterest] Starting Apify run: keywords=${JSON.stringify(keywords)}, maxPins=${maxPins}`);

  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQueries: keywords,
        maxPins: maxPins,
      }),
    },
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Apify Actor start failed: ${startRes.status} ${errText.slice(0, 300)}`);
  }

  const runData = await startRes.json();
  const runId: string = runData.data?.id;
  const datasetId: string = runData.data?.defaultDatasetId;
  let status: string = runData.data?.status ?? "RUNNING";
  console.log(`[Pinterest] Apify run started: runId=${runId}, datasetId=${datasetId}`);

  // 폴링 — 최대 90초 (30회 × 3초)
  let attempts = 0;
  const MAX_ATTEMPTS = 30;
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
    status = checkData.data?.status ?? status;
    attempts++;
    console.log(`[Pinterest] Polling attempt ${attempts}: status=${status}`);
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run did not succeed: status=${status} after ${attempts} attempts`);
  }

  // 결과 데이터 가져오기
  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=${maxPins}`,
  );
  if (!itemsRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${itemsRes.status}`);
  }
  const items = await itemsRes.json();
  console.log(`[Pinterest] Got ${items.length} items from dataset ${datasetId}`);
  return items;
}

// ─── 핀 → trend_analyses row 매핑 ────────────────────────────
// Apify automation-lab/pinterest-scraper 출력 필드:
//   id, title, description, url, imageUrl, thumbnailUrl,
//   saves, pinnerUsername, pinnerName, pinnerFollowers,
//   boardName, boardUrl, dominantColor, createdAt, isVideo, hashtags
function mapPinToRow(pin: any, userId: string, searchKeyword: string) {
  // hashtags + description + 검색어에서 키워드 추출
  const keywords: string[] = [];
  if (Array.isArray(pin.hashtags)) {
    keywords.push(...pin.hashtags.map((t: string) => t.replace(/^#/, "").toLowerCase()));
  }
  if (pin.description) {
    const descTags = (pin.description as string).match(/#[\w]+/g);
    if (descTags) keywords.push(...descTags.map((t: string) => t.replace("#", "").toLowerCase()));
  }
  keywords.push(...searchKeyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2));

  // 중복 제거 + 최대 10개
  const uniqueKeywords = [...new Set(keywords)].slice(0, 10);

  const permalink = pin.url || "";
  const imageUrl = pin.imageUrl || pin.thumbnailUrl || "";

  const followers = pin.pinnerFollowers != null
    ? parseInt(String(pin.pinnerFollowers), 10) || 0
    : 0;
  const saves = pin.saves != null ? parseInt(String(pin.saves), 10) || 0 : 0;
  const likes = pin.reactionCount != null ? parseInt(String(pin.reactionCount), 10) || 0 : 0;
  const comments = pin.commentCount != null ? parseInt(String(pin.commentCount), 10) || 0 : 0;

  // Pinterest engagement = saves + likes + comments
  const engagement = { likes, comments, shares: 0, views: 0, saves };
  const engagementRate = followers > 0
    ? ((likes + comments + saves) / followers) * 100
    : 0;

  return {
    user_id: userId,
    status: "analyzed",
    trend_keywords: uniqueKeywords,
    trend_categories: [] as string[],
    source_followers: followers || null,
    source_engagement: engagement,
    engagement_rate: Number(engagementRate.toFixed(4)),
    source_data: {
      platform: "pinterest",
      source_type: "pinterest",
      post_id: pin.id || permalink || null,
      image_url: imageUrl,
      permalink,
      author: pin.pinnerUsername || pin.pinnerName || "Pinterest",
      caption: (pin.description || pin.title || "").substring(0, 500),
      like_count: likes,
      view_count: 0,
      saves: saves || null,
      pinner_username: pin.pinnerUsername || null,
      pinner_name: pin.pinnerName || null,
      pinner_followers: followers || null,
      board_name: pin.boardName || null,
      board_url: pin.boardUrl || null,
      dominant_color: pin.dominantColor || null,
      is_video: pin.isVideo || false,
      search_keyword: searchKeyword,
      search_hashtags: [searchKeyword],
      trend_name: (pin.title || pin.description || "").substring(0, 100),
      trend_score: 50,
      summary_ko: "GPT 미연동 - 기본 수집",
      collected_at: new Date().toISOString(),
    },
  };
}

// ─── trend_source_profiles UPSERT (실패해도 수집은 계속) ─────
async function upsertSourceProfile(
  supabase: any,
  platform: string,
  accountName: string,
  accountUrl: string | null,
  followers: number | null,
  engagementRate: number,
): Promise<void> {
  if (!accountName) return;
  try {
    const { data: existing } = await supabase
      .from("trend_source_profiles")
      .select("id, avg_engagement_rate, total_trends_found")
      .eq("platform", platform)
      .eq("account_name", accountName)
      .maybeSingle();

    if (existing) {
      const newAvg = ((Number(existing.avg_engagement_rate) || 0) + engagementRate) / 2;
      await supabase
        .from("trend_source_profiles")
        .update({
          followers,
          account_url: accountUrl,
          avg_engagement_rate: Number(newAvg.toFixed(4)),
          total_trends_found: (existing.total_trends_found || 0) + 1,
          last_collected_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("trend_source_profiles")
        .insert({
          platform,
          account_name: accountName,
          account_url: accountUrl,
          followers,
          avg_engagement_rate: Number(engagementRate.toFixed(4)),
          total_trends_found: 1,
          last_collected_at: new Date().toISOString(),
        });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[source_profile] upsert failed for ${platform}/${accountName}:`, msg);
  }
}

// ─── 중복 체크 후 INSERT ──────────────────────────────────────
async function saveTrends(
  supabase: any,
  rows: ReturnType<typeof mapPinToRow>[],
  userId: string,
): Promise<{ inserted: number; duplicates: number }> {
  if (rows.length === 0) {
    console.log("[Pinterest] No rows to save");
    return { inserted: 0, duplicates: 0 };
  }

  // 기존 Pinterest post_id 조회 (중복 방지)
  const { data: existing } = await supabase
    .from("trend_analyses")
    .select("source_data")
    .eq("user_id", userId);

  const existingPostIds = new Set<string>();
  if (existing) {
    for (const row of existing) {
      const sd = row.source_data as any;
      if (sd?.platform === "pinterest" && sd?.post_id) {
        existingPostIds.add(String(sd.post_id));
      }
    }
  }

  const newRows = rows.filter((r) => {
    const postId = r.source_data?.post_id;
    return postId && !existingPostIds.has(String(postId));
  });

  const duplicates = rows.length - newRows.length;

  if (newRows.length === 0) {
    console.log(`[Pinterest] All ${duplicates} rows already exist, skipping`);
    return { inserted: 0, duplicates };
  }

  console.log(`[Pinterest] Inserting ${newRows.length} rows (${duplicates} duplicates skipped)`);
  console.log(`[Pinterest] Sample row:`, JSON.stringify(newRows[0]).substring(0, 300));

  const { data: inserted, error } = await supabase
    .from("trend_analyses")
    .insert(newRows)
    .select("id");

  if (error) {
    console.error("[Pinterest] Insert error:", error.message);
    throw new Error(`DB insert failed: ${error.message}`);
  }

  return { inserted: inserted?.length ?? 0, duplicates };
}

// ─── 메인 핸들러 ─────────────────────────────────────────────
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
    const userId: string | undefined = body?.user_id;
    const limitOverride: number | undefined = body?.limit;
    const keywordsOverride: string[] | undefined = body?.keywords;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 설정 읽기 ─────────────────────────────────────────────
    const settings = await getCollectionSettings(supabase);

    if (settings.is_enabled === false) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Pinterest collection is disabled",
          collected: 0,
          inserted: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const keywords = keywordsOverride?.length
      ? keywordsOverride
      : settings.keywords?.length
      ? settings.keywords
      : DEFAULT_KEYWORDS;

    const maxPins = limitOverride ?? settings.collect_limit ?? 20;

    console.log(`[Pinterest] keywords=${JSON.stringify(keywords)}, maxPins=${maxPins}`);

    // ── Apify 실행 ────────────────────────────────────────────
    const items = await runPinterestScraper(keywords, maxPins);

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pins collected", collected: 0, inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 매핑 ──────────────────────────────────────────────────
    // Apify는 모든 검색어 결과를 합쳐서 반환하므로 searchQuery 필드 우선 사용
    const rows = items.map((pin: any) => {
      const searchKeyword = pin.searchQuery || pin.query || keywords[0] || "fashion";
      return mapPinToRow(pin, userId, searchKeyword);
    });

    // ── DB 저장 ───────────────────────────────────────────────
    const { inserted, duplicates } = await saveTrends(supabase, rows, userId);

    // ── 임베딩 트리거 (Shein 패턴 동일) ──────────────────────
    let embeddingTriggered = false;
    if (inserted > 0) {
      try {
        await supabase.functions.invoke("generate-embedding", {
          body: { table: "trend_analyses", batch: true },
        });
        embeddingTriggered = true;
        console.log("[Pinterest] Embedding generation triggered");
      } catch (embedErr) {
        console.warn("[Pinterest] Embedding trigger failed (non-fatal):", embedErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: "pinterest",
        collected: items.length,
        inserted,
        duplicates,
        keywords,
        embeddingTriggered,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Pinterest] Fatal error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

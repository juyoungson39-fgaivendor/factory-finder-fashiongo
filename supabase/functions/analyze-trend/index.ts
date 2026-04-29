import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

// [TEST MODE] 테스트용 배치 제한 상수 — 프로덕션 시 값을 올려주세요
const MAX_BATCH_SIZE = 3;
const BATCH_LIMIT = MAX_BATCH_SIZE;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface TrendRow {
  id: string;
  user_id: string;
  trend_keywords: string[];
  trend_categories: string[];
  source_data: Record<string, any> | null;
  status: string | null;
}

interface GeminiKeyword {
  keyword: string;
  type: "item" | "style" | "color" | "silhouette" | "material" | "pattern";
}

type Gender = "women" | "men" | "unisex";
type BodyType = "slim" | "regular" | "plus";

interface GeminiAnalysis {
  keywords: GeminiKeyword[];
  category: string;
  trend_score: number;
  buyer_relevance: string;
  gender: Gender;
  body_type: BodyType;
  colors: string[];
  is_set: boolean;
  style_tags?: string[];
  primary_category?: string;
}

const ALLOWED_COLORS = [
  "black", "white", "red", "blue", "pink", "green", "beige",
  "brown", "gray", "navy", "yellow", "orange", "purple", "cream", "khaki",
];

const ALLOWED_STYLE_TAGS = [
  "Y2K", "Bohemian", "Minimal", "Streetwear", "Coastal",
  "Coquette", "Old Money", "Quiet Luxury", "Cottagecore", "Athleisure",
];

const ALLOWED_PRIMARY_CATEGORIES = [
  "Tops", "Dresses", "Outerwear", "Bottoms", "Shoes", "Accessories",
];

const HIGH_TRUST_PLATFORMS = new Set(["magazine", "google"]);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPrompt(row: TrendRow): string {
  const sd = row.source_data ?? {};
  const hashtags = (sd.search_hashtags ?? []).join(" ");
  const engagement = (sd.like_count ?? 0) + (sd.view_count ?? 0);
  const description =
    sd.caption || sd.summary_ko || row.trend_keywords.join(", ") || "";

  return `You are a fashion trend analyst for FashionGo, a US B2B wholesale fashion marketplace.
Analyze this social media fashion content and extract:

"keywords": array of objects, each with:
  "keyword": string (English, lowercase)
  "type": one of ["item", "style", "color", "silhouette", "material", "pattern"]

"category": one of ["Dresses", "Tops", "Bottoms", "Outerwear", "Accessories", "Shoes", "Activewear"]
"trend_score": integer 0-100
"buyer_relevance": string, one sentence

"gender": target gender. One of ["women", "men", "unisex"].
  - clearly feminine model/product → "women"
  - clearly masculine model/product → "men"
  - ambiguous or both → "unisex"

"body_type": body type of the model. One of ["slim", "regular", "plus"].
  - if no model is visible, return "regular"

"colors": array of 1-3 dominant lowercase English color names of the product/outfit.
  Use only from: ["black", "white", "red", "blue", "pink", "green", "beige", "brown", "gray", "navy", "yellow", "orange", "purple", "cream", "khaki"]
  Example: ["black", "white"]

"is_set": boolean. true if this is a set/coord/matching outfit (multiple coordinated pieces sold together).
  - keywords like "set", "coord", "2-piece", "matching", "outfit" in title → true
  - image shows a clearly coordinated multi-piece outfit → true
  - otherwise → false

Also classify this trend into style_tags from: Y2K, Bohemian, Minimal, Streetwear, Coastal, Coquette, Old Money, Quiet Luxury, Cottagecore, Athleisure.
And assign primary_category from: Tops, Dresses, Outerwear, Bottoms, Shoes, Accessories.
Return as "style_tags" (string array, 1-3 items, choose only from the allowed list) and "primary_category" (single string from the allowed list).

Content to analyze:
Title: ${sd.trend_name || row.trend_keywords.slice(0, 3).join(", ") || "(no title)"}
Description: ${description.substring(0, 800)}
Hashtags: ${hashtags}
Source: ${sd.platform || "unknown"}
Engagement: ${engagement}
Respond in JSON only, no markdown.`;
}

async function callAI(prompt: string, apiKey: string): Promise<GeminiAnalysis> {
  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "You are a fashion trend analyst. Respond in JSON only, no markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI Gateway 오류 (${res.status}): ${err}`);
  }

  const data = await res.json();
  const raw: string = data.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("AI 응답이 비어있습니다");

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned) as GeminiAnalysis;
  if (!Array.isArray(parsed.keywords)) {
    throw new Error("AI 응답에 keywords 배열이 없습니다");
  }

  // Normalize new metadata fields with safe defaults
  const validGenders: Gender[] = ["women", "men", "unisex"];
  const validBodyTypes: BodyType[] = ["slim", "regular", "plus"];

  parsed.gender = validGenders.includes(parsed.gender) ? parsed.gender : "women";
  parsed.body_type = validBodyTypes.includes(parsed.body_type) ? parsed.body_type : "regular";
  parsed.colors = Array.isArray(parsed.colors)
    ? parsed.colors
        .map((c) => String(c).toLowerCase().trim())
        .filter((c) => ALLOWED_COLORS.includes(c))
        .slice(0, 3)
    : [];
  parsed.is_set = typeof parsed.is_set === "boolean" ? parsed.is_set : false;

  parsed.style_tags = Array.isArray(parsed.style_tags)
    ? parsed.style_tags
        .map((t) => String(t).trim())
        .filter((t) => ALLOWED_STYLE_TAGS.includes(t))
        .slice(0, 3)
    : [];
  parsed.primary_category =
    typeof parsed.primary_category === "string" &&
    ALLOWED_PRIMARY_CATEGORIES.includes(parsed.primary_category)
      ? parsed.primary_category
      : undefined;

  return parsed;
}

// ─────────────────────────────────────────────────────────────
// Signal score / lifecycle / first_seen enrichment
// ─────────────────────────────────────────────────────────────
async function enrichTrendSignals(
  rowId: string,
  keywords: string[],
  platform: string,
  trendScore: number,
  styleTags: string[],
  primaryCategory: string | undefined,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const now = Date.now();
    const norm = (s: string) => s.toLowerCase().trim();
    const myKeywords = new Set(keywords.map(norm).filter(Boolean));
    if (myKeywords.size === 0) return;

    // Fetch related trends (last 60 days, excluding self).
    // We over-fetch by keyword overlap candidates using array overlap.
    const { data: related, error: relErr } = await supabase
      .from("trend_analyses")
      .select("id, trend_keywords, source_data, created_at")
      .neq("id", rowId)
      .gte("created_at", new Date(now - 60 * 24 * 3600 * 1000).toISOString())
      .overlaps("trend_keywords", Array.from(myKeywords))
      .limit(500);

    if (relErr) {
      console.warn(`[enrich] related fetch failed for ${rowId}:`, relErr.message);
    }

    const platformsOverlap = new Set<string>();
    let crossPlatformCount = 0;

    for (const r of related ?? []) {
      const otherKeywords = (r.trend_keywords ?? []).map((k: string) => norm(k));
      const overlapCount = otherKeywords.filter((k: string) => myKeywords.has(k)).length;
      if (overlapCount >= 2) {
        crossPlatformCount += 1;
        const p = (r as any).source_data?.platform;
        if (p && p !== platform) platformsOverlap.add(p);
      }
    }
    if (platform) platformsOverlap.add(platform);

    // ── Signal factors ────────────────────────────────────────
    // Base: confidence_score is approximated from trend_score (0-100) → 0-1
    const confidence = Math.max(0, Math.min(1, (trendScore ?? 0) / 100));
    const baseScore = Math.min(30, confidence * 30);

    const crossPlatformScore = Math.min(45, crossPlatformCount * 15);

    // Recency from this row's created_at — use NOW since we are right after analysis
    // For accurate recency we look up the row's created_at
    const { data: selfRow } = await supabase
      .from("trend_analyses")
      .select("created_at")
      .eq("id", rowId)
      .maybeSingle();
    const createdAt = selfRow?.created_at ? new Date(selfRow.created_at).getTime() : now;
    const ageHours = (now - createdAt) / (3600 * 1000);
    let recencyScore = 0;
    if (ageHours <= 48) recencyScore = 15;
    else if (ageHours <= 24 * 7) recencyScore = 10;

    const sourceTrust = HIGH_TRUST_PLATFORMS.has(platform) ? 10 : 5;

    const signalScore = baseScore + crossPlatformScore + recencyScore + sourceTrust;
    const signalFactors = {
      base: baseScore,
      cross_platform: crossPlatformScore,
      recency: recencyScore,
      source_trust: sourceTrust,
    };

    // ── first_seen_at ─────────────────────────────────────────
    let firstSeenAt: string;
    const earliestRelated = (related ?? [])
      .map((r: any) => (r.created_at ? new Date(r.created_at).getTime() : null))
      .filter((t): t is number => t !== null);
    if (earliestRelated.length > 0) {
      const earliest = Math.min(...earliestRelated, createdAt);
      firstSeenAt = new Date(earliest).toISOString();
    } else {
      firstSeenAt = new Date(createdAt).toISOString();
    }

    // ── Lifecycle classification ──────────────────────────────
    // Bucket related trends by date relative to NOW
    const buckets = { last7: 0, prev7: 0, last14: 0, prev14: 0, total: 0 };
    let peakWeekCount = 0;
    let mostRecentInPeak = 0;
    const weeklyCounts = new Map<number, number>();

    for (const r of related ?? []) {
      const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
      if (!ts) continue;
      buckets.total += 1;
      const ageDays = (now - ts) / (24 * 3600 * 1000);
      if (ageDays <= 7) buckets.last7 += 1;
      else if (ageDays <= 14) buckets.prev7 += 1;
      if (ageDays <= 14) buckets.last14 += 1;
      else if (ageDays <= 28) buckets.prev14 += 1;

      const weekIdx = Math.floor(ageDays / 7);
      weeklyCounts.set(weekIdx, (weeklyCounts.get(weekIdx) ?? 0) + 1);
    }
    for (const [idx, count] of weeklyCounts) {
      if (count > peakWeekCount) {
        peakWeekCount = count;
        mostRecentInPeak = idx;
      }
    }

    const ageDaysSelf = (now - createdAt) / (24 * 3600 * 1000);
    const firstSeenAgeDays = (now - new Date(firstSeenAt).getTime()) / (24 * 3600 * 1000);
    const velocity =
      buckets.prev7 > 0
        ? (buckets.last7 - buckets.prev7) / buckets.prev7
        : buckets.last7 > 0
        ? 1
        : 0;
    const growth14 =
      buckets.prev14 > 0
        ? (buckets.last14 - buckets.prev14) / buckets.prev14
        : buckets.last14 > 0
        ? 1
        : 0;

    let lifecycleStage = "emerging";
    if (firstSeenAgeDays <= 7 && platformsOverlap.size <= 1) {
      lifecycleStage = "emerging";
    } else if (firstSeenAgeDays >= 30 && Math.abs(velocity) <= 0.2) {
      lifecycleStage = "classic";
    } else if (mostRecentInPeak === 0 && peakWeekCount > 0) {
      lifecycleStage = "peak";
    } else if (peakWeekCount > 0 && buckets.last7 <= peakWeekCount * 0.7) {
      lifecycleStage = "declining";
    } else if (growth14 >= 0.5) {
      lifecycleStage = "rising";
    }

    // ── supply_gap_score: count matched products ──────────────
    let matchedCount = 0;
    const { count: mc, error: mcErr } = await supabase
      .from("match_feedback")
      .select("*", { count: "exact", head: true })
      .eq("trend_id", rowId)
      .eq("is_relevant", true);
    if (!mcErr && typeof mc === "number") matchedCount = mc;
    const supplyGapScore = signalScore * (1 - Math.min(matchedCount / 10, 1));

    // ── Update trend row ──────────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      signal_score: Number(signalScore.toFixed(2)),
      platform_count: platformsOverlap.size,
      signal_factors: signalFactors,
      lifecycle_stage: lifecycleStage,
      first_seen_at: firstSeenAt,
      velocity: Number(velocity.toFixed(4)),
      supply_gap_score: Number(supplyGapScore.toFixed(2)),
    };
    if (styleTags && styleTags.length > 0) updatePayload.style_tags = styleTags;
    if (primaryCategory) updatePayload.primary_category = primaryCategory;

    const { error: upErr } = await supabase
      .from("trend_analyses")
      .update(updatePayload as any)
      .eq("id", rowId);

    if (upErr) {
      console.warn(`[enrich] update failed for ${rowId}:`, upErr.message);
    } else {
      console.log(
        `[enrich] ${rowId} signal=${signalScore.toFixed(1)} stage=${lifecycleStage} platforms=${platformsOverlap.size}`
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[enrich] error for ${rowId}:`, msg);
  }
}

/** Fire-and-forget: generate embedding */
async function triggerEmbedding(
  rowId: string,
  row: TrendRow,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const sd = row.source_data ?? {};
  const text = [row.trend_keywords.join(" "), sd.trend_name, sd.caption?.substring(0, 300)]
    .filter(Boolean)
    .join(" ");

  const body: Record<string, unknown> = { table: "trend_analyses", id: rowId, text };
  if (sd.image_url) body.image_url = sd.image_url;

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn(`generate-embedding 호출 실패 (${res.status}) for ${rowId}:`, await res.text());
  } else {
    console.log(`generate-embedding 완료: ${rowId}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Core: analyze one row
// All AI analysis results are stored inside the source_data JSONB column,
// because trend_analyses has NO top-level ai_analyzed / ai_keywords / trend_score columns.
// ─────────────────────────────────────────────────────────────
async function analyzeOne(
  row: TrendRow,
  apiKey: string,
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    const prompt = buildPrompt(row);
    const analysis = await callAI(prompt, apiKey);

    const keywordStrings = analysis.keywords.map((k) => k.keyword);
    const hasCategory =
      Array.isArray(row.trend_categories) && row.trend_categories.length > 0;

    // Merge analysis results INTO source_data JSONB
    const updatedSourceData = {
      ...(row.source_data ?? {}),
      ai_analyzed: true,
      ai_keywords: analysis.keywords,
      trend_score: analysis.trend_score,
      buyer_relevance: analysis.buyer_relevance,
      gender: analysis.gender,
      body_type: analysis.body_type,
      colors: analysis.colors,
      is_set: analysis.is_set,
    };

    const { error: updateErr } = await supabase
      .from("trend_analyses")
      .update({
        trend_keywords: keywordStrings,
        ...(hasCategory ? {} : { trend_categories: [analysis.category] }),
        status: "analyzed",
        source_data: updatedSourceData,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", row.id);

    if (updateErr) throw new Error(`DB 업데이트 실패: ${updateErr.message}`);

    // Fire-and-forget: generate embedding
    triggerEmbedding(
      row.id,
      { ...row, trend_keywords: keywordStrings },
      supabaseUrl,
      serviceRoleKey
    ).catch((e) => console.warn("embedding trigger error:", e));

    return { id: row.id, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`analyzeOne 실패 [${row.id}]:`, message);

    await supabase
      .from("trend_analyses")
      .update({ status: "analyze_failed" } as any)
      .eq("id", row.id)
      .then(() => {});

    return { id: row.id, success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST만 지원합니다" }, 405);
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY가 설정되지 않았습니다");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { trend_item_id, batch, source } = body as {
      trend_item_id?: string;
      batch?: boolean;
      source?: string;
    };

    // ── Batch mode ──────────────────────────────────────────
    if (batch) {
      console.log(`[TEST MODE] 최대 ${MAX_BATCH_SIZE}건 제한`);
      // Use source_data->>ai_analyzed to check; rows without it are unanalyzed
      let query = supabase
        .from("trend_analyses")
        .select("id, user_id, trend_keywords, trend_categories, source_data, status")
        .or("source_data->ai_analyzed.is.null,source_data->>ai_analyzed.eq.false")
        .limit(BATCH_LIMIT);

      if (source) {
        query = query.eq("source_data->>platform", source);
      }

      const { data: rows, error: fetchErr } = await query;
      if (fetchErr) throw new Error(`DB 조회 실패: ${fetchErr.message}`);
      if (!rows || rows.length === 0) {
        return jsonResponse({ success: true, processed: 0, message: "분석할 항목이 없습니다" });
      }

      const results = await Promise.allSettled(
        (rows as TrendRow[]).map((row) =>
          analyzeOne(row, LOVABLE_API_KEY, supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        )
      );

      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;
      const failed = results.length - succeeded;
      const errors = results
        .filter((r) => r.status === "fulfilled" && !(r as PromiseFulfilledResult<any>).value.success)
        .map((r) => (r as PromiseFulfilledResult<any>).value);

      return jsonResponse({
        success: true,
        total: rows.length,
        processed: succeeded,
        failed,
        ...(errors.length > 0 ? { errors } : {}),
      });
    }

    // ── Single item mode ────────────────────────────────────
    if (!trend_item_id) {
      return jsonResponse({ error: "trend_item_id 또는 batch: true 가 필요합니다" }, 400);
    }

    const { data: row, error: fetchErr } = await supabase
      .from("trend_analyses")
      .select("id, user_id, trend_keywords, trend_categories, source_data, status")
      .eq("id", trend_item_id)
      .single();

    if (fetchErr || !row) {
      return jsonResponse(
        { error: `trend_item_id를 찾을 수 없습니다: ${trend_item_id}` },
        404
      );
    }

    const result = await analyzeOne(
      row as TrendRow,
      LOVABLE_API_KEY,
      supabase,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    if (!result.success) {
      return jsonResponse({ success: false, error: result.error }, 500);
    }

    return jsonResponse({ success: true, id: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("analyze-trend error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

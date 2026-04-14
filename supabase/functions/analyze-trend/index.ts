import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.0-flash";
const BATCH_LIMIT = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** trend_analyses row shape (only what we need) */
interface TrendRow {
  id: string;
  user_id: string;
  trend_keywords: string[];
  trend_categories: string[];
  source_data: {
    platform?: string;
    caption?: string;
    image_url?: string;
    like_count?: number;
    view_count?: number;
    search_hashtags?: string[];
    trend_name?: string;
    summary_ko?: string;
  } | null;
  status: string | null;
  ai_analyzed: boolean | null;
}

interface GeminiKeyword {
  keyword: string;
  type: "item" | "style" | "color" | "silhouette" | "material" | "pattern";
}

interface GeminiAnalysis {
  keywords: GeminiKeyword[];
  category: string;
  trend_score: number;
  buyer_relevance: string;
}

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
  const engagement =
    (sd.like_count ?? 0) + (sd.view_count ?? 0);

  // Use caption as description; fall back to existing summary or keywords
  const description =
    sd.caption ||
    sd.summary_ko ||
    row.trend_keywords.join(", ") ||
    "";

  return `You are a fashion trend analyst for FashionGo, a US B2B wholesale fashion marketplace.
Analyze this social media fashion content and extract:

"keywords": array of objects, each with:
  "keyword": string (English, lowercase)
  "type": one of ["item", "style", "color", "silhouette", "material", "pattern"]
  예: {"keyword": "midi dress", "type": "item"}, {"keyword": "vintage", "type": "style"}

"category": one of ["Dresses", "Tops", "Bottoms", "Outerwear", "Accessories", "Shoes", "Activewear"]
"trend_score": integer 0-100, based on:
  engagement relative to source average (40%)
  keyword novelty/freshness (30%)
  relevance to US wholesale fashion market (30%)

"buyer_relevance": string, one sentence explaining why FashionGo buyers would care

Content to analyze:
Title: ${sd.trend_name || row.trend_keywords.slice(0, 3).join(", ") || "(no title)"}
Description: ${description.substring(0, 800)}
Hashtags: ${hashtags}
Source: ${sd.platform || "unknown"}
Engagement: ${engagement}
Respond in JSON only, no markdown.`;
}

async function callGemini(
  prompt: string,
  apiKey: string
): Promise<GeminiAnalysis> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${err}`);
  }

  const data = await res.json();
  const raw: string =
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!raw) throw new Error("Gemini 응답이 비어있습니다");

  // Strip markdown code fences if present (defensive)
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned) as GeminiAnalysis;

  // Basic validation
  if (!Array.isArray(parsed.keywords)) {
    throw new Error("Gemini 응답에 keywords 배열이 없습니다");
  }

  return parsed;
}

/** Invoke generate-embedding function for the newly analyzed row */
async function triggerEmbedding(
  rowId: string,
  row: TrendRow,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const sd = row.source_data ?? {};
  const text = [
    row.trend_keywords.join(" "),
    sd.trend_name,
    sd.caption?.substring(0, 300),
  ]
    .filter(Boolean)
    .join(" ");

  const body: Record<string, unknown> = {
    table: "trend_analyses",
    id: rowId,
    text,
  };
  if (sd.image_url) body.image_url = sd.image_url;

  const fnUrl = `${supabaseUrl}/functions/v1/generate-embedding`;
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Non-fatal: log but don't fail the whole analysis
    console.warn(
      `generate-embedding 호출 실패 (${res.status}) for ${rowId}:`,
      await res.text()
    );
  } else {
    console.log(`generate-embedding 완료: ${rowId}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Core: analyze one row
// ─────────────────────────────────────────────────────────────
async function analyzeOne(
  row: TrendRow,
  apiKey: string,
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    const prompt = buildPrompt(row);
    const analysis = await callGemini(prompt, apiKey);

    // Extract keyword strings for trend_keywords array
    const keywordStrings = analysis.keywords.map((k) => k.keyword);

    // Only set category if no existing one
    const hasCategory =
      Array.isArray(row.trend_categories) && row.trend_categories.length > 0;

    const { error: updateErr } = await supabase
      .from("trend_analyses")
      .update({
        ai_analyzed: true,
        ai_keywords: analysis.keywords,       // full objects [{keyword, type}, ...]
        trend_score: analysis.trend_score,
        trend_keywords: keywordStrings,        // overwrite with AI-refined keywords
        ...(hasCategory ? {} : { trend_categories: [analysis.category] }),
        status: "analyzed",
        source_data: {
          ...(row.source_data ?? {}),
          buyer_relevance: analysis.buyer_relevance,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateErr) throw new Error(`DB 업데이트 실패: ${updateErr.message}`);

    // Fire-and-forget: generate embedding using AI-refined keywords + image
    triggerEmbedding(
      row.id,
      { ...row, trend_keywords: keywordStrings },  // use freshly extracted keywords
      supabaseUrl,
      serviceRoleKey
    ).catch((e) => console.warn("embedding trigger error:", e));

    return { id: row.id, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`analyzeOne 실패 [${row.id}]:`, message);

    // Mark as failed so it doesn't block future batches
    await supabase
      .from("trend_analyses")
      .update({ status: "analyze_failed" })
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다");

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

    // ── 배치 모드 ───────────────────────────────────────────────
    if (batch) {
      let query = supabase
        .from("trend_analyses")
        .select(
          "id, user_id, trend_keywords, trend_categories, source_data, status, ai_analyzed"
        )
        .eq("ai_analyzed", false)
        .limit(BATCH_LIMIT);

      // source 필터: source_data->>platform 기준
      if (source) {
        query = query.eq("source_data->>platform", source);
      }

      const { data: rows, error: fetchErr } = await query;
      if (fetchErr) throw new Error(`DB 조회 실패: ${fetchErr.message}`);
      if (!rows || rows.length === 0) {
        return jsonResponse({
          success: true,
          processed: 0,
          message: "분석할 항목이 없습니다",
        });
      }

      const results = await Promise.allSettled(
        (rows as TrendRow[]).map((row) =>
          analyzeOne(row, GEMINI_API_KEY, supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        )
      );

      const succeeded = results.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;
      const failed = results.length - succeeded;
      const errors = results
        .filter((r) => r.status === "fulfilled" && !(r as PromiseFulfilledResult<{ id: string; success: boolean; error?: string }>).value.success)
        .map((r) => (r as PromiseFulfilledResult<{ id: string; success: boolean; error?: string }>).value);

      return jsonResponse({
        success: true,
        total: rows.length,
        processed: succeeded,
        failed,
        ...(errors.length > 0 ? { errors } : {}),
      });
    }

    // ── 단건 모드 ───────────────────────────────────────────────
    if (!trend_item_id) {
      return jsonResponse(
        { error: "trend_item_id 또는 batch: true 가 필요합니다" },
        400
      );
    }

    const { data: row, error: fetchErr } = await supabase
      .from("trend_analyses")
      .select(
        "id, user_id, trend_keywords, trend_categories, source_data, status, ai_analyzed"
      )
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
      GEMINI_API_KEY,
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

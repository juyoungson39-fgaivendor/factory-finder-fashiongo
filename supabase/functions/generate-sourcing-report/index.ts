import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

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
  trend_keywords: string[];
  trend_categories: string[];
  // deno-lint-ignore no-explicit-any
  source_data: Record<string, any> | null;
  trend_score: number | null;
  // deno-lint-ignore no-explicit-any
  ai_keywords: any[] | null;
}

interface MatrixRow {
  trend_id: string;
  trend_title: string;
  trend_score: number;
  // deno-lint-ignore no-explicit-any
  ai_keywords: any[];
  // deno-lint-ignore no-explicit-any
  matched_products: any[];
}

interface SourcingOpportunity {
  rank: number;
  trend_title: string;
  recommended_products: string[];
  reason: string;
  estimated_demand: "high" | "medium" | "low";
  suggested_price_range: string;
  target_buyer_segment: string;
}

interface CategoryInsight {
  category: string;
  trend_direction: "rising" | "stable" | "declining";
  key_styles: string[];
  recommendation: string;
}

interface ReportData {
  executive_summary: string;
  top_opportunities: SourcingOpportunity[];
  category_insights: CategoryInsight[];
  action_items: string[];
  risk_alerts: string[];
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

function extractUserIdFromJwt(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.sub as string) ?? null;
  } catch {
    return null;
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
    // ── Env vars ────────────────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY가 설정되지 않았습니다");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Auth ─────────────────────────────────────────────────
    const userId = extractUserIdFromJwt(req.headers.get("Authorization"));
    if (!userId) {
      return jsonResponse({ error: "인증이 필요합니다. 로그인 후 다시 시도해주세요." }, 401);
    }

    // ── Request params ───────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      period_days = 7,
      min_similarity = 0.3,
      max_items = 20,
      category = "all",
    } = body as {
      period_days?: number;
      min_similarity?: number;
      max_items?: number;
      category?: string;
    };

    const since = new Date(
      Date.now() - period_days * 24 * 60 * 60 * 1000
    ).toISOString();

    // ── 1. Fetch trend analyses ───────────────────────────────
    let trendQuery = supabase
      .from("trend_analyses")
      .select(
        "id, trend_keywords, trend_categories, source_data, trend_score, ai_keywords"
      )
      .gte("created_at", since)
      .not("source_data->ai_analyzed", "is", null)
      .order("trend_score", { ascending: false })
      .limit(max_items);

    if (category !== "all") {
      trendQuery = trendQuery.contains("trend_categories", [category]);
    }

    const { data: trends, error: trendErr } = await trendQuery;
    if (trendErr) {
      console.warn("trend_analyses 조회 실패:", trendErr.message);
    }

    // ── 2. Fetch sourceable products (category distribution) ──
    const { data: products, error: prodErr } = await supabase
      .from("sourceable_products")
      .select("category, price")
      .not("embedding", "is", null)
      .limit(500);

    if (prodErr) {
      console.warn("sourceable_products 조회 실패:", prodErr.message);
    }

    const catDist: Record<string, number> = {};
    for (const p of products ?? []) {
      const cat = (p.category as string | null) ?? "Unknown";
      catDist[cat] = (catDist[cat] ?? 0) + 1;
    }
    const totalProducts = products?.length ?? 0;

    // ── 3. Get trend-product matrix via RPC ───────────────────
    const { data: matrixData, error: matrixErr } = await supabase.rpc(
      "get_trend_product_matrix",
      {
        period_days,
        min_similarity,
        max_products_per_trend: 3,
      }
    );

    if (matrixErr) {
      console.warn("get_trend_product_matrix RPC 실패:", matrixErr.message);
    }

    // ── 4. Build prompt data ──────────────────────────────────
    const trendRows = (trends ?? []) as TrendRow[];

    const trendSummary = trendRows.slice(0, 15).map((t) => {
      const sd = t.source_data ?? {};
      const kwds: string[] = Array.isArray(t.ai_keywords)
        ? t.ai_keywords.map((k: { keyword?: string }) => k.keyword ?? String(k)).filter(Boolean)
        : (t.trend_keywords ?? []);
      return {
        title:
          sd.trend_name ||
          (t.trend_keywords ?? []).slice(0, 3).join(", ") ||
          "(제목 없음)",
        score: t.trend_score ?? 0,
        keywords: kwds.slice(0, 5),
        category:
          sd.category ||
          (t.trend_categories ?? [])[0] ||
          "Unknown",
        buyer_relevance: sd.buyer_relevance ?? "",
      };
    });

    const matrixRows = (matrixData ?? []) as MatrixRow[];
    const matchingSummary = matrixRows.slice(0, 10).map((row) => ({
      trend: row.trend_title,
      trend_score: row.trend_score,
      products: (row.matched_products ?? []).map((p: Record<string, unknown>) => ({
        name: p.product_name,
        factory: p.factory_name,
        similarity: p.similarity,
        price: p.price,
      })),
    }));

    const categoryDistText = Object.entries(catDist)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([cat, cnt]) => `${cat}: ${cnt}개`)
      .join(", ");

    // ── 5. AI call ─────────────────────────────────────────────
    const systemPrompt =
      `You are a sourcing strategist for FashionGo, a US B2B wholesale fashion marketplace. ` +
      `Your job is to analyze trend data and product inventory to recommend the best sourcing opportunities for this week. ` +
      `Always respond in valid JSON only, no markdown fences.`;

    const userPrompt =
      `Based on the following data, generate a weekly sourcing intelligence report.\n\n` +
      `## Trend Analysis Data (last ${period_days} days, ${trendRows.length} trends analyzed):\n` +
      `${JSON.stringify(trendSummary, null, 2)}\n\n` +
      `## Trend-Product Matching Results:\n` +
      `${JSON.stringify(matchingSummary, null, 2)}\n\n` +
      `## Factory Product Inventory:\n` +
      `Distribution: ${categoryDistText || "No data"}\n` +
      `Total sourceable products with embeddings: ${totalProducts}\n\n` +
      `Generate a JSON report with this exact structure:\n` +
      `{\n` +
      `  "executive_summary": "3-4 sentence overview of this week's top sourcing opportunities for FashionGo buyers",\n` +
      `  "top_opportunities": [\n` +
      `    {\n` +
      `      "rank": 1,\n` +
      `      "trend_title": "trend name",\n` +
      `      "recommended_products": ["product_name1", "product_name2"],\n` +
      `      "reason": "Why this is a top opportunity for FashionGo wholesale buyers",\n` +
      `      "estimated_demand": "high" | "medium" | "low",\n` +
      `      "suggested_price_range": "$XX-$XX",\n` +
      `      "target_buyer_segment": "who should buy this"\n` +
      `    }\n` +
      `  ],\n` +
      `  "category_insights": [\n` +
      `    {\n` +
      `      "category": "Dresses",\n` +
      `      "trend_direction": "rising" | "stable" | "declining",\n` +
      `      "key_styles": ["style1", "style2"],\n` +
      `      "recommendation": "actionable sourcing recommendation"\n` +
      `    }\n` +
      `  ],\n` +
      `  "action_items": [\n` +
      `    "Specific action for this week e.g. Prioritize stocking crop tops - 3 trend sources confirm rising demand"\n` +
      `  ],\n` +
      `  "risk_alerts": [\n` +
      `    "Specific risk e.g. Oversaturation in basic tees - 12 vendors already listing"\n` +
      `  ]\n` +
      `}\n\n` +
      `Include at least 3 top_opportunities, 3 category_insights, 3 action_items, and 2 risk_alerts. ` +
      `Focus on actionable insights for US wholesale fashion buyers. Respond in JSON only.`;

    const aiRes = await fetch(LOVABLE_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI Gateway 오류 (${aiRes.status}): ${errText.slice(0, 300)}`);
    }

    const aiData = await aiRes.json();
    const rawText: string =
      aiData.choices?.[0]?.message?.content ?? "";

    if (!rawText) throw new Error("AI 응답이 비어있습니다");

    // Strip any accidental markdown fences
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let reportData: ReportData;
    try {
      reportData = JSON.parse(cleaned) as ReportData;
    } catch {
      throw new Error(`AI 응답 JSON 파싱 실패: ${cleaned.slice(0, 200)}`);
    }

    // Validate required fields
    if (!reportData.executive_summary) {
      throw new Error("AI 응답에 executive_summary가 없습니다");
    }
    if (!Array.isArray(reportData.top_opportunities)) {
      reportData.top_opportunities = [];
    }
    if (!Array.isArray(reportData.category_insights)) {
      reportData.category_insights = [];
    }
    if (!Array.isArray(reportData.action_items)) {
      reportData.action_items = [];
    }
    if (!Array.isArray(reportData.risk_alerts)) {
      reportData.risk_alerts = [];
    }

    // ── 6. Save to sourcing_reports ───────────────────────────
    const { data: savedReport, error: saveErr } = await supabase
      .from("sourcing_reports")
      .insert({
        user_id: userId,
        period_days,
        report_data: reportData,
        summary: reportData.executive_summary,
      })
      .select()
      .single();

    if (saveErr) {
      // Don't fail the whole request just because saving failed
      console.error("sourcing_reports 저장 실패:", saveErr.message);
    }

    return jsonResponse({
      success: true,
      report_id: savedReport?.id ?? null,
      report: {
        id: savedReport?.id,
        period_days,
        generated_at: savedReport?.generated_at ?? new Date().toISOString(),
        ...reportData,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-sourcing-report error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

type Period = "7d" | "14d" | "30d";
type Category =
  | "all"
  | "Dresses"
  | "Tops"
  | "Bottoms"
  | "Outerwear"
  | "Accessories"
  | "Shoes"
  | "Activewear";

interface KeywordFreq {
  keyword: string;
  count: number;
  totalScore: number;
  sources: Set<string>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function periodToDays(period: Period): number {
  return period === "7d" ? 7 : period === "14d" ? 14 : 30;
}

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
    const {
      period = "7d",
      limit = 20,
      category = "all",
    } = body as { period?: Period; limit?: number; category?: Category };

    const days = periodToDays(period);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. trend_analyses 조회 및 키워드 집계 ──────────────────
    const { data: trends, error: trendErr } = await supabase
      .from("trend_analyses")
      .select("trend_keywords, trend_categories, source_data")
      .gte("created_at", since)
      .limit(500);

    if (trendErr) throw new Error(`trend_analyses 조회 실패: ${trendErr.message}`);

    // 키워드 빈도 집계
    const kwMap = new Map<string, KeywordFreq>();

    for (const row of trends ?? []) {
      const sd = row.source_data as Record<string, unknown> | null;
      const platform = (sd?.platform as string) ?? "unknown";

      // trend_keywords (text[])
      const basicKws: string[] = row.trend_keywords ?? [];

      // ai_keywords (from source_data jsonb)
      const rawAiKw = sd?.ai_keywords;
      const aiKws: string[] = Array.isArray(rawAiKw)
        ? (rawAiKw as { keyword: string }[]).map((k) => k.keyword)
        : [];

      // Merge, prefer ai_keywords but include all
      const allKws = [...new Set([...aiKws, ...basicKws])];

      for (const kw of allKws) {
        if (!kw) continue;
        const key = kw.toLowerCase().trim();
        const existing = kwMap.get(key) ?? {
          keyword: key,
          count: 0,
          totalScore: 0,
          sources: new Set<string>(),
        };
        existing.count++;
        existing.totalScore += (sd?.trend_score as number) ?? 50;
        existing.sources.add(platform);
        kwMap.set(key, existing);
      }
    }

    // 카테고리 필터 적용 (trend_categories 기준)
    let filteredTrends = trends ?? [];
    if (category !== "all") {
      filteredTrends = filteredTrends.filter((row) => {
        const cats: string[] = row.trend_categories ?? [];
        const aiCat = (row.source_data as Record<string, string> | null)?.category ?? "";
        return cats.includes(category) || aiCat === category;
      });
    }

    // 상위 50개 키워드 정리
    const topKwList = [...kwMap.values()]
      .sort((a, b) => b.count * (b.totalScore / b.count) - a.count * (a.totalScore / a.count))
      .slice(0, 50)
      .map((k) => ({
        keyword: k.keyword,
        count: k.count,
        avg_score: Math.round(k.totalScore / k.count),
        sources: [...k.sources].join(", "),
      }));

    // ── 2. sourceable_products 키워드 분포 파악 ────────────────
    const { data: products, error: prodErr } = await supabase
      .from("sourceable_products")
      .select("category, material, vendor_name")
      .limit(500);

    if (prodErr) {
      console.warn("sourceable_products 조회 실패:", prodErr.message);
    }

    // 카테고리별 상품 수
    const catCountMap = new Map<string, number>();
    for (const p of products ?? []) {
      const cat = (p.category as string | null) ?? "Unknown";
      catCountMap.set(cat, (catCountMap.get(cat) ?? 0) + 1);
    }
    const productCategorySummary = [...catCountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cat, cnt]) => `${cat}: ${cnt}개`)
      .join(", ");

    const totalProducts = products?.length ?? 0;
    const totalTrends = trends?.length ?? 0;

    if (topKwList.length === 0) {
      return jsonResponse({
        period,
        generated_at: new Date().toISOString(),
        keywords: [],
        total_trends_analyzed: totalTrends,
        total_products_checked: totalProducts,
        message: "분석할 트렌드 데이터가 없습니다. 먼저 SNS 트렌드를 수집해주세요.",
      });
    }

    // ── 3. Gemini 호출 ─────────────────────────────────────────
    const trendDataText = topKwList
      .map(
        (k) =>
          `- "${k.keyword}": 등장 ${k.count}회, 평균 trend_score ${k.avg_score}, 소스: ${k.sources}`
      )
      .join("\n");

    const prompt = `You are a keyword strategist for FashionGo, a US B2B wholesale fashion marketplace.

Based on the following data, recommend the top ${limit} keywords that FashionGo buyers are most likely to search this week.

## Recent SNS Trend Keywords (last ${period}):
${trendDataText}

## Available Factory Product Distribution:
${productCategorySummary || "No product data available"}
Total products: ${totalProducts}

${category !== "all" ? `## Category Filter: Focus on "${category}" category only.\n` : ""}
For each recommended keyword, provide:
1. "keyword": string (English, lowercase)
2. "category": one of ["Dresses", "Tops", "Bottoms", "Outerwear", "Accessories", "Shoes", "Activewear"]
3. "type": one of ["item", "style", "color", "material", "pattern", "occasion"]
4. "confidence": integer 0-100
5. "reason": one sentence why this keyword will perform well this week for US wholesale buyers
6. "trend_direction": one of ["rising", "stable", "emerging"]
7. "matching_products_count": estimated matching factory products (integer)
8. "suggested_search_terms": array of exactly 2-3 related search terms

Sort by confidence descending. Return a JSON object with key "keywords" containing the array. Respond in JSON only, no markdown.`;

    const geminiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: "You are a keyword strategist. Respond in JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!geminiRes.ok) {
      throw new Error(`AI Gateway 오류 (${geminiRes.status}): ${await geminiRes.text()}`);
    }

    const geminiData = await geminiRes.json();
    const rawText: string =
      geminiData.choices?.[0]?.message?.content ?? "";
    if (!rawText) throw new Error("AI 응답이 비어있습니다");

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { keywords: unknown[] };
    const keywords = (parsed.keywords ?? []) as Array<{
      keyword: string;
      category: string;
      type: string;
      confidence: number;
      reason: string;
      trend_direction: string;
      matching_products_count: number;
      suggested_search_terms: string[];
    }>;

    return jsonResponse({
      period,
      generated_at: new Date().toISOString(),
      keywords: keywords.slice(0, limit).map((k, i) => ({ rank: i + 1, ...k })),
      total_trends_analyzed: totalTrends,
      total_products_checked: totalProducts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("recommend-keywords error:", message);
    return jsonResponse({ error: message }, 500);
  }
});

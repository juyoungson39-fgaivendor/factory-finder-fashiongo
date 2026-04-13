import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { matchKeywords, FASHION_KEYWORDS, type KeywordCategory } from "../_shared/fashion-keywords.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TrendAnalysisRow {
  id: string;
  user_id: string;
  trend_keywords: string[];
  source_data: Record<string, unknown> | null;
  created_at: string;
}

interface DailyStat {
  date: string;   // YYYY-MM-DD
  count: number;
}

interface KeywordResult {
  keyword: string;
  category: KeywordCategory;
  daily: DailyStat[];
  total_7d: number;
  total_30d: number;
  growth_7d: number | null;   // % (null = 이전 데이터 없음)
  growth_30d: number | null;
}

function toDateStr(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

function calcGrowth(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { user_id, rebuild = false, platform } = body as { user_id?: string; rebuild?: boolean; platform?: string };

    // user_id 결정: 요청 바디 우선, 없으면 JWT에서 추출
    let userId = user_id;
    if (!userId) {
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        userId = user?.id;
      }
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. trend_analyses 조회 ──
    let query = supabase
      .from("trend_analyses")
      .select("id, user_id, trend_keywords, source_data, created_at")
      .eq("user_id", userId)
      .eq("status", "analyzed")
      .order("created_at", { ascending: true });

    // 플랫폼 필터 (source_data->>'platform')
    if (platform && platform !== "all") {
      query = query.eq("source_data->>platform", platform);
    }

    const { data: analyses, error: fetchErr } = await query;

    if (fetchErr) throw fetchErr;
    if (!analyses || analyses.length === 0) {
      return new Response(JSON.stringify({ keywords: [], total_analyses: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. 날짜별 키워드 카운트 집계 ──
    // { keyword → { date → count } }
    const countsMap = new Map<string, Map<string, number>>();
    // keyword → category
    const categoryMap = new Map<string, KeywordCategory>();

    for (const row of analyses as TrendAnalysisRow[]) {
      const sd = row.source_data as Record<string, unknown> | null;
      const texts: (string | undefined)[] = [
        ...(row.trend_keywords ?? []),
        ...((sd?.search_hashtags as string[]) ?? []),
        ...((sd?.trend_keywords as string[]) ?? []),
        (sd?.caption as string | undefined),
        (sd?.trend_name as string | undefined),
        (sd?.summary_ko as string | undefined),
      ];

      const matched = matchKeywords(texts);
      const dateStr = toDateStr(row.created_at);

      for (const kw of matched) {
        categoryMap.set(kw.keyword, kw.category);
        if (!countsMap.has(kw.keyword)) countsMap.set(kw.keyword, new Map());
        const dayMap = countsMap.get(kw.keyword)!;
        dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + 1);
      }
    }

    // ── 3. rebuild 시 기존 통계 삭제 후 재삽입 ──
    if (rebuild) {
      await supabase.from("trend_keyword_stats").delete().eq("user_id", userId);
    }

    // ── 4. trend_keyword_stats upsert ──
    const upsertRows: {
      user_id: string;
      keyword: string;
      category: string;
      stat_date: string;
      post_count: number;
    }[] = [];

    for (const [keyword, dayMap] of countsMap) {
      const category = categoryMap.get(keyword)!;
      for (const [stat_date, post_count] of dayMap) {
        upsertRows.push({ user_id: userId, keyword, category, stat_date, post_count });
      }
    }

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("trend_keyword_stats")
        .upsert(upsertRows, { onConflict: "user_id,keyword,stat_date" });
      if (upsertErr) throw upsertErr;
    }

    // ── 5. 기간별 증감률 계산 ──
    const today = new Date();
    const dateOf = (daysAgo: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };

    const cur7Start = dateOf(6);   // 오늘 포함 최근 7일
    const prev7Start = dateOf(13); // 그 이전 7일
    const cur30Start = dateOf(29); // 오늘 포함 최근 30일
    const prev30Start = dateOf(59);// 그 이전 30일
    const todayStr = dateOf(0);

    const results: KeywordResult[] = [];

    for (const [keyword, dayMap] of countsMap) {
      const daily: DailyStat[] = Array.from(dayMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      let total_7d = 0, prev7 = 0, total_30d = 0, prev30 = 0;
      for (const { date, count } of daily) {
        if (date >= cur7Start && date <= todayStr) total_7d += count;
        if (date >= prev7Start && date < cur7Start) prev7 += count;
        if (date >= cur30Start && date <= todayStr) total_30d += count;
        if (date >= prev30Start && date < cur30Start) prev30 += count;
      }

      results.push({
        keyword,
        category: categoryMap.get(keyword)!,
        daily,
        total_7d,
        total_30d,
        growth_7d: calcGrowth(total_7d, prev7),
        growth_30d: calcGrowth(total_30d, prev30),
      });
    }

    // total_7d 기준 내림차순 정렬
    results.sort((a, b) => b.total_7d - a.total_7d);

    return new Response(
      JSON.stringify({ keywords: results, total_analyses: analyses.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-trend-keywords error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

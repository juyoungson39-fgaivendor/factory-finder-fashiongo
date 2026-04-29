import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PERIOD_DAYS = 7;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SignalRow {
  user_id: string | null;
  search_query: string | null;
  keyword: string | null;
  price_range: { min?: number; max?: number; avg?: number } | null;
}

interface TrendKwRow {
  id: string;
  trend_keywords: string[] | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return jsonResponse({ error: "Missing supabase env" }, 500);
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const periodEnd = new Date();
    const periodStart = new Date(
      periodEnd.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000
    );
    const periodStartIso = periodStart.toISOString();
    const periodStartDate = periodStart.toISOString().slice(0, 10);
    const periodEndDate = periodEnd.toISOString().slice(0, 10);

    // 1) Pull signals
    const { data: signals, error: sigErr } = await supabase
      .from("fg_buyer_signals")
      .select("user_id, search_query, keyword, price_range")
      .gte("created_at", periodStartIso)
      .limit(10000);
    if (sigErr) throw sigErr;

    const rows = (signals ?? []) as SignalRow[];

    // 2) Group by keyword (search_query primary, keyword fallback)
    interface Agg {
      keyword: string;
      buyers: Set<string>;
      count: number;
      prices: number[];
    }
    const agg = new Map<string, Agg>();
    for (const r of rows) {
      const kw = (r.search_query ?? r.keyword ?? "").trim().toLowerCase();
      if (!kw) continue;
      let g = agg.get(kw);
      if (!g) {
        g = { keyword: kw, buyers: new Set(), count: 0, prices: [] };
        agg.set(kw, g);
      }
      g.count++;
      if (r.user_id) g.buyers.add(r.user_id);
      const pr = r.price_range;
      if (pr) {
        const v =
          typeof pr.avg === "number"
            ? pr.avg
            : typeof pr.min === "number" && typeof pr.max === "number"
            ? (pr.min + pr.max) / 2
            : typeof pr.min === "number"
            ? pr.min
            : typeof pr.max === "number"
            ? pr.max
            : null;
        if (v !== null && !Number.isNaN(v)) g.prices.push(v);
      }
    }

    if (agg.size === 0) {
      return jsonResponse({ aggregated: 0, period_days: PERIOD_DAYS });
    }

    // 3) Pull recent trend keyword rows for matching
    const { data: trendRows, error: trErr } = await supabase
      .from("trend_analyses")
      .select("id, trend_keywords")
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )
      .not("trend_keywords", "is", null)
      .limit(2000);
    if (trErr) console.warn("[aggregate-buyer-demand] trend fetch:", trErr);
    const trends = (trendRows ?? []) as TrendKwRow[];

    // 4) For each keyword, find related trends + supply count
    let upserted = 0;
    for (const [, g] of agg) {
      try {
        const kwLower = g.keyword.toLowerCase();

        const relatedTrendIds: string[] = [];
        for (const t of trends) {
          const kws = (t.trend_keywords ?? []).map((k) => k.toLowerCase());
          if (kws.some((k) => k.includes(kwLower) || kwLower.includes(k))) {
            relatedTrendIds.push(t.id);
          }
        }

        let supplyMatchCount = 0;
        if (relatedTrendIds.length > 0) {
          const { count } = await supabase
            .from("match_feedback")
            .select("id", { count: "exact", head: true })
            .in("trend_id", relatedTrendIds.slice(0, 100))
            .eq("is_relevant", true);
          supplyMatchCount = count ?? 0;
        }

        const uniqueBuyers = g.buyers.size;
        const avgPrice =
          g.prices.length > 0
            ? g.prices.reduce((a, b) => a + b, 0) / g.prices.length
            : null;
        const ratio = uniqueBuyers / Math.max(supplyMatchCount, 1);

        const payload: Record<string, unknown> = {
          keyword: g.keyword,
          period_start: periodStartDate,
          period_end: periodEndDate,
          search_count: g.count,
          unique_buyers: uniqueBuyers,
          avg_price_interest: avgPrice,
          related_trend_ids: relatedTrendIds.slice(0, 50),
          supply_match_count: supplyMatchCount,
          demand_supply_ratio: Number(ratio.toFixed(4)),
        };

        const { error: upErr } = await supabase
          .from("buyer_demand_summary")
          .upsert(payload, { onConflict: "keyword,period_start,period_end" });
        if (upErr) {
          console.warn("[aggregate-buyer-demand] upsert error:", upErr);
        } else {
          upserted++;
        }
      } catch (e) {
        console.error("[aggregate-buyer-demand] keyword error:", e);
      }
    }

    return jsonResponse({
      period_days: PERIOD_DAYS,
      keywords_processed: agg.size,
      aggregated: upserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[aggregate-buyer-demand] fatal:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});

// Stage 3 매칭: target_products(SKU) ↔ sourcing_products(SKU)
// 공장은 점수 필터로만 사용. 매칭 산식엔 빠짐.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface TargetProduct {
  id: string;
  name: string | null;
  trend_keywords: string[] | null;
  category: string | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  reference_image_urls: string[] | null;
}

interface SourcingProduct {
  id: string;
  factory_id: string;
  external_id: string;
  title: string | null;
  image_url: string | null;
  tags: string[] | null;
  category: string | null;
  price_cny: number | null;
  price_usd_est: number | null;
  is_new: boolean | null;
  is_best: boolean | null;
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const B = new Set(b.map((x) => x.toLowerCase().trim()).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function categorySim(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return 0;
  if (x === y) return 1.0;
  if (x.includes(y) || y.includes(x)) return 0.6;
  return 0;
}

function priceUsd(s: SourcingProduct): number | null {
  if (s.price_usd_est != null) return Number(s.price_usd_est);
  if (s.price_cny != null) return Number(s.price_cny) * 0.14 * 1.5;
  return null;
}

function priceFit(t: TargetProduct, s: SourcingProduct): number {
  const p = priceUsd(s);
  if (p == null) return 0.5;
  const lo = t.price_min_usd != null ? Number(t.price_min_usd) : null;
  const hi = t.price_max_usd != null ? Number(t.price_max_usd) : null;
  if (lo == null && hi == null) return 0.7;
  if (lo != null && p < lo) {
    const gap = (lo - p) / Math.max(lo, 1);
    return Math.max(0, 1 - gap);
  }
  if (hi != null && p > hi) {
    const gap = (p - hi) / Math.max(hi, 1);
    return Math.max(0, 1 - gap);
  }
  return 1.0;
}

function bestWeight(s: SourcingProduct): number {
  if (s.is_best) return 1.0;
  if (s.is_new) return 0.7;
  return 0;
}

// image_sim 미보유 → image 가중치(0.15)를 나머지에 비례 재분배
const W = { keyword: 0.35, category: 0.20, price: 0.25, image: 0.15, best: 0.05 };

function compute(t: TargetProduct, s: SourcingProduct) {
  const k = jaccard(t.trend_keywords ?? [], s.tags ?? []);
  const c = categorySim(t.category, s.category);
  const p = priceFit(t, s);
  const b = bestWeight(s);
  const img = 0; // v1: no embeddings
  const baseTotal = W.keyword + W.category + W.price + W.best; // 0.85
  // redistribute image weight proportionally
  const factor = 1 + W.image / baseTotal;
  const score =
    (k * W.keyword + c * W.category + p * W.price + b * W.best) * factor;
  return {
    score: Math.min(1, score),
    breakdown: { keyword: k, category: c, price: p, image: img, best: b },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const factoryThreshold = Number(body?.factory_threshold ?? 60);
    const scoreThreshold = Number(body?.score_threshold ?? 0.6);

    // Resolve user (best-effort; auth optional)
    let triggeredBy: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data: { user } } = await userClient.auth.getUser();
        triggeredBy = user?.id ?? null;
      } catch { /* ignore */ }
    }

    // Create run row
    const { data: runRow, error: runErr } = await supabase
      .from("e2e_stage_runs")
      .insert({ stage_no: 3, status: "running", triggered_by: triggeredBy })
      .select("run_id")
      .single();
    if (runErr || !runRow) throw new Error(`run insert failed: ${runErr?.message}`);
    const runId = (runRow as any).run_id as string;

    const finalize = async (summary: any) => {
      await supabase
        .from("e2e_stage_runs")
        .update({ status: "completed", finished_at: new Date().toISOString(), summary })
        .eq("run_id", runId);
      return json({ ok: true, run_id: runId, summary, inserted: summary.pairs ?? 0 });
    };

    // 1. passing factories
    const { data: factoriesRaw } = await supabase
      .from("factories")
      .select("id, stock_score, oem_score, score_status, deleted_at")
      .eq("score_status", "ai_scored")
      .is("deleted_at", null);
    const passingFactoryIds = (factoriesRaw ?? [])
      .filter((f: any) => Math.max(Number(f.stock_score ?? 0), Number(f.oem_score ?? 0)) >= factoryThreshold)
      .map((f: any) => f.id as string);

    // 2. targets
    const { data: targets } = await supabase
      .from("target_products")
      .select("id, name, trend_keywords, category, price_min_usd, price_max_usd, reference_image_urls")
      .eq("status", "active");

    if (!targets || targets.length === 0) {
      return await finalize({
        targets: 0, sourcing: 0, passing_factories: passingFactoryIds.length,
        pairs: 0, avg_score: 0,
        threshold_factory: factoryThreshold, threshold_match: scoreThreshold,
        reason: "no_targets",
      });
    }

    if (passingFactoryIds.length === 0) {
      return await finalize({
        targets: targets.length, sourcing: 0, passing_factories: 0,
        pairs: 0, avg_score: 0,
        threshold_factory: factoryThreshold, threshold_match: scoreThreshold,
        reason: "no_factories",
      });
    }

    // 3. sourcing pool
    const { data: sourcing } = await supabase
      .from("sourcing_products")
      .select("id, factory_id, external_id, title, image_url, tags, category, price_cny, price_usd_est, is_new, is_best")
      .in("factory_id", passingFactoryIds);

    if (!sourcing || sourcing.length === 0) {
      return await finalize({
        targets: targets.length, sourcing: 0, passing_factories: passingFactoryIds.length,
        pairs: 0, avg_score: 0,
        threshold_factory: factoryThreshold, threshold_match: scoreThreshold,
        reason: "no_sourcing",
      });
    }

    // 4. cartesian + top 5 per target
    const matchesToInsert: any[] = [];
    let scoreSum = 0;
    let pairCount = 0;

    for (const t of targets as TargetProduct[]) {
      const scored: { s: SourcingProduct; score: number; breakdown: any }[] = [];
      for (const s of sourcing as SourcingProduct[]) {
        const { score, breakdown } = compute(t, s);
        if (score >= scoreThreshold) scored.push({ s, score, breakdown });
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 5);
      for (const item of top) {
        matchesToInsert.push({
          run_id: runId,
          target_product_id: t.id,
          sourcing_product_id: item.s.id,
          factory_id: item.s.factory_id,
          score: item.score,
          score_breakdown: item.breakdown,
          // legacy compat fields
          target_id: t.id,
          total_score: item.score,
          breakdown: item.breakdown,
        });
        scoreSum += item.score;
        pairCount++;
      }
    }

    if (pairCount === 0) {
      return await finalize({
        targets: targets.length, sourcing: sourcing.length,
        passing_factories: passingFactoryIds.length,
        pairs: 0, avg_score: 0,
        threshold_factory: factoryThreshold, threshold_match: scoreThreshold,
        reason: "no_matches",
      });
    }

    // chunked insert
    const CHUNK = 500;
    for (let i = 0; i < matchesToInsert.length; i += CHUNK) {
      const slice = matchesToInsert.slice(i, i + CHUNK);
      const { error } = await supabase.from("matches").insert(slice);
      if (error) console.error("[run-matching] insert chunk error:", error.message);
    }

    return await finalize({
      targets: targets.length,
      sourcing: sourcing.length,
      passing_factories: passingFactoryIds.length,
      pairs: pairCount,
      avg_score: Math.round((scoreSum / pairCount) * 1000) / 1000,
      threshold_factory: factoryThreshold,
      threshold_match: scoreThreshold,
      reason: "ok",
    });
  } catch (e: any) {
    console.error("[run-matching] error:", e?.message ?? e);
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});

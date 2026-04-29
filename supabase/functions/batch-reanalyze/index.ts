// Batch reanalyze edge function: scans trend_analyses for rows missing
// lifecycle_stage or style_tags and re-runs analyze-trend in small batches.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BATCH_SIZE = 2;          // Gemini rate limit 회피 (동시 호출 축소)
const BATCH_DELAY_MS = 6000;   // 배치 간 6초 딜레이 (~20 req/min)
const PER_CALL_TIMEOUT_MS = 45_000;
const MAX_RUN_MS = 140_000;    // 게이트웨이 150s 한계 직전에 종료

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callAnalyzeTrend(trendId: string, attempt = 1): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-trend`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trend_id: trendId, enrich_only: true }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      // Retry once on rate limit
      if ((res.status === 429 || /rate limit/i.test(txt)) && attempt < 3) {
        clearTimeout(t);
        const backoff = 4000 * attempt;
        console.warn(`Rate limited for ${trendId}, retry #${attempt} in ${backoff}ms`);
        await sleep(backoff);
        return callAnalyzeTrend(trendId, attempt + 1);
      }
      console.error(`analyze-trend ${res.status} for ${trendId}: ${txt.slice(0, 200)}`);
      return false;
    }
    await res.text();
    return true;
  } catch (e) {
    console.error(`analyze-trend failed for ${trendId}:`, (e as Error).message);
    return false;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Find trends needing reanalysis
  const { data: rows, error } = await supabase
    .from("trend_analyses")
    .select("id, lifecycle_stage, style_tags")
    .or("lifecycle_stage.is.null,style_tags.is.null")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const targets = (rows ?? []).filter(
    (r: any) =>
      r.lifecycle_stage == null ||
      r.style_tags == null ||
      (Array.isArray(r.style_tags) && r.style_tags.length === 0),
  );

  const total = targets.length;
  const totalBatches = Math.ceil(total / BATCH_SIZE);

  console.log(`batch-reanalyze: ${total} trends, ${totalBatches} batches (background)`);

  // Run processing in background to avoid gateway 150s timeout.
  const work = (async () => {
    let processed = 0;
    let failed = 0;
    const failedIds: string[] = [];
    for (let b = 0; b < totalBatches; b++) {
      if (Date.now() - startedAt > MAX_RUN_MS) {
        console.warn("Max run time reached, stopping early");
        break;
      }
      const slice = targets.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const results = await Promise.all(
        slice.map((r: any) => callAnalyzeTrend(r.id)),
      );
      results.forEach((ok, i) => {
        if (ok) processed++;
        else {
          failed++;
          failedIds.push(slice[i].id);
        }
      });
      console.log(
        `Batch ${b + 1}/${totalBatches} completed: ${processed}/${total} (failed: ${failed})`,
      );
      if (b < totalBatches - 1) await sleep(BATCH_DELAY_MS);
    }
    console.log(
      `batch-reanalyze DONE: processed=${processed} failed=${failed} duration=${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
  })();

  // @ts-ignore EdgeRuntime is available in Deno deploy
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

  return jsonResponse({
    status: "started",
    total,
    total_batches: totalBatches,
    note: "Processing in background. Check edge function logs for progress.",
  });
});

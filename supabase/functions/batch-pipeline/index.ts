import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants & Types
// ─────────────────────────────────────────────────────────────

// [TEST MODE] 테스트용 배치 제한 상수 — 프로덕션 시 값을 올려주세요
const MAX_BATCH_SIZE = 3;
const INTER_STAGE_DELAY_MS = 2_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type TriggeredBy = "manual" | "scheduled";
type PipelineStatus = "running" | "completed" | "failed" | "partial";

interface ErrorLogEntry {
  stage: string;
  source?: string;
  error: string;
}

interface CollectResult {
  count: number;
  failed: number;
  errors: ErrorLogEntry[];
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

/** JWT payload decode (no verification — Edge Function already trusts the runtime) */
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// Collect stage helpers
// ─────────────────────────────────────────────────────────────
async function callCollectFn(
  fnName: string,
  body: Record<string, unknown>,
  supabaseUrl: string,
  serviceKey: string
): Promise<{ count: number; failed: number }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`${fnName} failed (${res.status}): ${text.slice(0, 200)}`);
      return { count: 0, failed: 1 };
    }

    const data = await res.json();
    // Different collect functions return counts under different keys
    const count =
      Number(data?.saved ?? data?.inserted ?? data?.collected ?? data?.count ?? 0);
    return { count, failed: 0 };
  } catch (err) {
    console.error(`${fnName} exception:`, err);
    return { count: 0, failed: 1 };
  }
}

async function runCollectStage(
  sources: string[],
  userId: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<CollectResult> {
  type CallEntry = {
    fn: string;
    label: string;
    body: Record<string, unknown>;
  };
  const calls: CallEntry[] = [];

  // SNS: instagram + tiktok → collect-sns-trends (consolidated)
  const snsSources = sources.filter((s) =>
    ["instagram", "tiktok"].includes(s)
  );
  if (snsSources.length > 0) {
    const snsSource =
      snsSources.includes("instagram") && snsSources.includes("tiktok")
        ? "all"
        : snsSources[0]; // "instagram" or "tiktok"
    calls.push({
      fn: "collect-sns-trends",
      label: "sns",
      body: { source: snsSource, limit: MAX_BATCH_SIZE, user_id: userId },
    });
  }

  if (sources.includes("magazine")) {
    calls.push({
      fn: "collect-magazine-trends",
      label: "magazine",
      body: { user_id: userId },
    });
  }
  if (sources.includes("google")) {
    calls.push({
      fn: "collect-google-image-trends",
      label: "google",
      body: { user_id: userId, limit: MAX_BATCH_SIZE },
    });
  }
  if (sources.includes("amazon")) {
    calls.push({
      fn: "collect-amazon-image-trends",
      label: "amazon",
      body: { user_id: userId, limit: MAX_BATCH_SIZE },
    });
  }
  if (sources.includes("pinterest")) {
    calls.push({
      fn: "collect-pinterest-image-trends",
      label: "pinterest",
      body: { user_id: userId, limit: MAX_BATCH_SIZE },
    });
  }
  if (sources.includes("fashiongo")) {
    calls.push({
      fn: "collect-fg-buyer-signals",
      label: "fashiongo",
      body: { user_id: userId, limit: 20, mode: "mock" },
    });
  }

  if (calls.length === 0) return { count: 0, failed: 0, errors: [] };

  // Run all source collections in parallel
  const settled = await Promise.allSettled(
    calls.map((c) => callCollectFn(c.fn, c.body, supabaseUrl, serviceKey)
      .then((r) => ({ ...r, label: c.label }))
    )
  );

  let count = 0;
  let failed = 0;
  const errors: ErrorLogEntry[] = [];

  for (const r of settled) {
    if (r.status === "fulfilled") {
      count += r.value.count;
      if (r.value.failed > 0) {
        failed += r.value.failed;
        errors.push({
          stage: "collect",
          source: r.value.label,
          error: "collect function returned failure",
        });
      }
    } else {
      failed++;
      errors.push({
        stage: "collect",
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  return { count, failed, errors };
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const {
      sources = ["instagram", "tiktok", "magazine", "google", "amazon", "pinterest"],
      analyze = true,
      embed = true,
      backprop = false,
      triggered_by = "manual",
    } = body as {
      sources?: string[];
      analyze?: boolean;
      embed?: boolean;
      backprop?: boolean;
      triggered_by?: TriggeredBy;
    };

    // ── Resolve user IDs ─────────────────────────────────────
    let userIds: string[] = [];

    if (triggered_by === "manual") {
      const userId = extractUserIdFromJwt(req.headers.get("Authorization"));
      if (userId) userIds = [userId];
    } else {
      // Scheduled: collect for all users with active trend_schedules
      const { data: schedules } = await supabase
        .from("trend_schedules")
        .select("user_id")
        .eq("is_active", true);
      userIds = [
        ...new Set(
          (schedules ?? []).map((s: Record<string, unknown>) => s.user_id as string)
        ),
      ];
    }

    if (userIds.length === 0) {
      return jsonResponse(
        {
          error:
            "수집 대상 사용자가 없습니다. 트렌드 스케줄을 활성화하거나 로그인 후 다시 시도해주세요.",
        },
        400
      );
    }

    // ── Create batch_run record ──────────────────────────────
    const { data: batchRun, error: insertErr } = await supabase
      .from("batch_runs")
      .insert({ triggered_by, status: "running" })
      .select()
      .single();

    if (insertErr || !batchRun) {
      throw new Error(`batch_runs INSERT 실패: ${insertErr?.message ?? "unknown"}`);
    }

    const batchRunId = batchRun.id as string;
    const startMs = Date.now();
    const errorLog: ErrorLogEntry[] = [];
    let collectedCount = 0;
    let analyzedCount = 0;
    let embeddedCount = 0;
    let failedCount = 0;

    // Helper: partial-progress updates
    const updateRun = (patch: Record<string, unknown>) =>
      supabase.from("batch_runs").update(patch).eq("id", batchRunId);

    // ── Stage 1: Collect ─────────────────────────────────────
    console.log(`[TEST MODE] 최대 ${MAX_BATCH_SIZE}건 제한`);
    try {
      for (const userId of userIds) {
        const { count, failed, errors } = await runCollectStage(
          sources,
          userId,
          SUPABASE_URL,
          SERVICE_KEY
        );
        collectedCount += count;
        failedCount += failed;
        errorLog.push(...errors);
      }
      await updateRun({ collected_count: collectedCount, failed_count: failedCount });
      console.log(`[batch-pipeline] collect done: ${collectedCount} items`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errorLog.push({ stage: "collect", error: msg });
      failedCount++;
      console.error("[batch-pipeline] collect stage error:", msg);
    }

    // [TEST MODE] 스테이지 간 딜레이
    await sleep(INTER_STAGE_DELAY_MS);

    // ── Stage 2: Analyze ─────────────────────────────────────
    if (analyze) {
      try {
        const analyzeRes = await fetch(
          `${SUPABASE_URL}/functions/v1/analyze-trend`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({ batch: true }),
          }
        );

        const analyzeData = analyzeRes.ok
          ? await analyzeRes.json()
          : { processed: 0, failed: analyzeRes.status };

        analyzedCount = Number(analyzeData?.processed ?? 0);
        const analyzeFailed = Number(analyzeData?.failed ?? 0);
        failedCount += analyzeFailed;

        if (Array.isArray(analyzeData?.errors)) {
          for (const e of analyzeData.errors) {
            errorLog.push({
              stage: "analyze",
              error: (e as Record<string, string>).error ?? String(e),
            });
          }
        }

        await updateRun({ analyzed_count: analyzedCount, failed_count: failedCount });
        console.log(`[batch-pipeline] analyze done: ${analyzedCount} processed, ${analyzeFailed} failed`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorLog.push({ stage: "analyze", error: msg });
        console.error("[batch-pipeline] analyze stage error:", msg);
        // Partial failure — continue to embed
      }
    }

    // ── Rate-limit pause between Gemini stages ───────────────
    await sleep(INTER_STAGE_DELAY_MS);

    // ── Stage 3: Embed ───────────────────────────────────────
    if (embed) {
      try {
        const embedRes = await fetch(
          `${SUPABASE_URL}/functions/v1/generate-embedding`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({ batch: true, table: "trend_analyses" }),
          }
        );

        const embedData = embedRes.ok
          ? await embedRes.json()
          : { processed: 0, failed: embedRes.status };

        embeddedCount = Number(embedData?.processed ?? 0);
        const embedFailed = Number(embedData?.failed ?? 0);
        failedCount += embedFailed;

        if (Array.isArray(embedData?.errors)) {
          for (const e of embedData.errors) {
            errorLog.push({
              stage: "embed",
              error: (e as Record<string, string>).error ?? String(e),
            });
          }
        }

        await updateRun({ embedded_count: embeddedCount, failed_count: failedCount });
        console.log(`[batch-pipeline] embed done: ${embeddedCount} processed, ${embedFailed} failed`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorLog.push({ stage: "embed", error: msg });
        console.error("[batch-pipeline] embed stage error:", msg);
      }
    }

    // ── Stage 4 (Optional): Trend Backpropagation ────────────
    let backpropCount = 0;
    if (backprop) {
      try {
        const backpropRes = await fetch(
          `${SUPABASE_URL}/functions/v1/update-trend-backprop`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
              period_days: 30,
              min_similarity: 0.3,
              triggered_by: "batch",
            }),
          }
        );

        const backpropData = backpropRes.ok
          ? await backpropRes.json()
          : { factories_updated: 0 };

        backpropCount = Number(backpropData?.factories_updated ?? 0);

        if (!backpropRes.ok) {
          errorLog.push({
            stage: "backprop",
            error: `HTTP ${backpropRes.status}`,
          });
        }

        console.log(
          `[batch-pipeline] backprop done: ${backpropCount} factories updated`
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errorLog.push({ stage: "backprop", error: msg });
        console.error("[batch-pipeline] backprop stage error:", msg);
      }
    }

    // ── Finalize ─────────────────────────────────────────────
    const durationSeconds = Math.round((Date.now() - startMs) / 1000);

    let finalStatus: PipelineStatus;
    if (collectedCount === 0 && failedCount > 0) {
      finalStatus = "failed";
    } else if (errorLog.length > 0) {
      finalStatus = "partial";
    } else {
      finalStatus = "completed";
    }

    await supabase
      .from("batch_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        collected_count: collectedCount,
        analyzed_count: analyzedCount,
        embedded_count: embeddedCount,
        failed_count: failedCount,
        error_log: errorLog,
      })
      .eq("id", batchRunId);

    console.log(
      `[batch-pipeline] finished: ${finalStatus} in ${durationSeconds}s`,
      { collected: collectedCount, analyzed: analyzedCount, embedded: embeddedCount, backprop: backpropCount }
    );

    return jsonResponse({
      batch_run_id: batchRunId,
      status: finalStatus,
      collected: collectedCount,
      analyzed: analyzedCount,
      embedded: embeddedCount,
      backprop_factories: backpropCount,
      failed: failedCount,
      duration_seconds: durationSeconds,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("batch-pipeline fatal error:", message);
    return jsonResponse({ error: message }, 500);
  }
});

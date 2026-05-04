import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants & Types
// ─────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 20;
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
  bySource: Record<string, { count: number; failed: number; skipped?: boolean; reason?: string; error?: string }>;
}

const PER_COLLECT_TIMEOUT_MS = 60_000; // 60초 per source
const COLLECT_STAGE_TIMEOUT_MS = 90_000; // 90초 전체

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
): Promise<{ count: number; failed: number; skipped?: boolean; reason?: string; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_COLLECT_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      const snippet = text.slice(0, 300);
      console.error(`[batch-pipeline] ${fnName} failed (HTTP ${res.status}): ${snippet}`);
      return { count: 0, failed: 1, error: `HTTP ${res.status}: ${snippet}` };
    }

    const data = await res.json();
    const count =
      Number(data?.saved ?? data?.inserted ?? data?.collected ?? data?.count ?? 0);
    if (data?.error) {
      console.error(`[batch-pipeline] ${fnName} returned error: ${data.error}`);
      return { count, failed: 1, error: String(data.error) };
    }
    if (data?.skipped) {
      console.log(`[batch-pipeline] ${fnName} skipped: ${data?.message ?? "disabled"}`);
      return { count, failed: 0, skipped: true, reason: String(data?.message ?? "skipped") };
    }
    console.log(`[batch-pipeline] ${fnName}: ${count} items collected`);
    return { count, failed: 0 };
  } catch (err) {
    const isAbort = (err as { name?: string })?.name === "AbortError";
    if (isAbort) {
      console.warn(`[batch-pipeline] ${fnName} ${PER_COLLECT_TIMEOUT_MS / 1000}s timeout - skip`);
      return { count: 0, failed: 1, skipped: true, reason: "timeout", error: "timeout" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[batch-pipeline] ${fnName} exception:`, msg);
    return { count: 0, failed: 1, error: msg };
  } finally {
    clearTimeout(timeoutId);
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
      // Pinterest는 Apify 1회 실행으로 다수 핀을 가져오므로 limit을 크게
      body: { user_id: userId, limit: 20 },
    });
  }
  if (sources.includes("shein")) {
    calls.push({
      fn: "collect-shein-trends",
      label: "shein",
      body: { user_id: userId, limit: MAX_BATCH_SIZE },
    });
  }
  if (sources.includes("zara")) {
    calls.push({
      fn: "collect-zara-trends",
      label: "zara",
      body: { user_id: userId, limit: 20 },
    });
  }
  if (sources.includes("fashiongo")) {
    calls.push({
      fn: "collect-fg-buyer-signals",
      label: "fashiongo",
      body: { user_id: userId, limit: 20, mode: "mock" },
    });
  }

  if (calls.length === 0) return { count: 0, failed: 0, errors: [], bySource: {} };

  // Run all source collections in parallel — wrapped with stage-level timeout
  type SettledArr = PromiseSettledResult<{ count: number; failed: number; label: string; skipped?: boolean; reason?: string; error?: string }>[];
  const allSettledPromise: Promise<SettledArr> = Promise.allSettled(
    calls.map((c) => callCollectFn(c.fn, c.body, supabaseUrl, serviceKey)
      .then((r) => ({ ...r, label: c.label }))
    )
  );

  let settled: SettledArr = [];
  let stageTimedOut = false;
  try {
    settled = await Promise.race([
      allSettledPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("collect_stage_timeout")), COLLECT_STAGE_TIMEOUT_MS)
      ),
    ]);
  } catch (_e) {
    stageTimedOut = true;
    console.warn(`[collect-stage] ${COLLECT_STAGE_TIMEOUT_MS / 1000}초 전체 타임아웃 - 완료된 소스만 진행`);
    settled = await Promise.race([
      allSettledPromise,
      new Promise<SettledArr>((resolve) => setTimeout(() => resolve([]), 100)),
    ]);
  }

  let count = 0;
  let failed = 0;
  const errors: ErrorLogEntry[] = [];
  const bySource: Record<string, { count: number; failed: number; skipped?: boolean; reason?: string; error?: string }> = {};

  for (let i = 0; i < calls.length; i++) {
    const label = calls[i].label;
    if (!bySource[label]) bySource[label] = { count: 0, failed: 0 };
    const r = settled[i];

    if (!r) {
      bySource[label].skipped = true;
      bySource[label].reason = "stage_timeout";
      bySource[label].failed += 1;
      bySource[label].error = "stage_timeout";
      failed++;
      errors.push({ stage: "collect", source: label, error: "stage_timeout" });
      console.error(`[batch-pipeline] ${label} failed: stage_timeout`);
      continue;
    }

    if (r.status === "fulfilled") {
      count += r.value.count;
      bySource[label].count += r.value.count;
      if (r.value.skipped) {
        bySource[label].skipped = true;
        bySource[label].reason = r.value.reason;
      }
      if (r.value.error) {
        bySource[label].error = r.value.error;
      }
      if (r.value.failed > 0) {
        failed += r.value.failed;
        bySource[label].failed += r.value.failed;
        const errMsg = r.value.error ?? r.value.reason ?? "collect function returned failure";
        errors.push({
          stage: "collect",
          source: r.value.label,
          error: errMsg,
        });
        console.error(`[batch-pipeline] ${label} failed: ${errMsg}`);
      } else {
        console.log(`[batch-pipeline] ${label}: ${r.value.count} items collected`);
      }
    } else {
      failed++;
      bySource[label].failed += 1;
      const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      bySource[label].error = errMsg;
      errors.push({
        stage: "collect",
        source: label,
        error: errMsg,
      });
      console.error(`[batch-pipeline] ${label} failed: ${errMsg}`);
    }
  }

  if (stageTimedOut) {
    errors.push({ stage: "collect", error: "collect_stage_timeout" });
  }

  return { count, failed, errors, bySource };
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
      sources = ["instagram", "tiktok", "magazine", "google", "amazon", "pinterest", "shein", "zara"],
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
    const collectBySource: Record<string, { count: number; failed: number; skipped?: boolean; reason?: string; error?: string }> = {};
    let analyzedCount = 0;
    let embeddedCount = 0;
    let failedCount = 0;

    // Helper: partial-progress updates
    const updateRun = (patch: Record<string, unknown>) =>
      supabase.from("batch_runs").update(patch).eq("id", batchRunId);

    // ── Stage 1: Collect ─────────────────────────────────────
    console.log(`[batch-pipeline] 배치 크기: ${MAX_BATCH_SIZE}건`);
    try {
      for (const userId of userIds) {
        const { count, failed, errors, bySource } = await runCollectStage(
          sources,
          userId,
          SUPABASE_URL,
          SERVICE_KEY
        );
        collectedCount += count;
        failedCount += failed;
        errorLog.push(...errors);
        for (const [src, v] of Object.entries(bySource)) {
          if (!collectBySource[src]) collectBySource[src] = { count: 0, failed: 0 };
          collectBySource[src].count += v.count;
          collectBySource[src].failed += v.failed;
        }
      }
      await updateRun({ collected_count: collectedCount, failed_count: failedCount });
      console.log(`[batch-pipeline] collect done: ${collectedCount} items`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errorLog.push({ stage: "collect", error: msg });
      failedCount++;
      console.error("[batch-pipeline] collect stage error:", msg);
    }

    // 스테이지 간 sleep 제거 (타임아웃 여유 확보)

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

    // 스테이지 간 sleep 제거 (타임아웃 여유 확보)

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

      // ── Stage 4: Clustering (fire-and-forget) ──────────────
      try {
        for (const userId of userIds) {
          fetch(`${SUPABASE_URL}/functions/v1/cluster-trends`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SERVICE_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ user_id: userId }),
          }).catch(() => {});
        }
        console.log("[batch-pipeline] cluster-trends fired (fire-and-forget)");
      } catch {
        // ignore
      }
    }

    // ── Stage 5 (Optional): Trend Backpropagation ────────────
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
      collected_by_source: collectBySource,
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

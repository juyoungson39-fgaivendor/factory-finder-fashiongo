import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface BackpropRow {
  factory_id: string;
  factory_name: string;
  trend_match_score: number;
  matched_count: number;
  updated: boolean;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Auth: manual 호출은 로그인 필요 ──────────────────────
    const authHeader = req.headers.get("Authorization");
    const userId = extractUserIdFromJwt(authHeader);

    // ── Request params ───────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      period_days = 30,
      min_similarity = 0.3,
      triggered_by = "manual",
    } = body as {
      period_days?: number;
      min_similarity?: number;
      triggered_by?: "manual" | "scheduled" | "batch";
    };

    // manual 호출은 인증 필요
    if (triggered_by === "manual" && !userId) {
      return jsonResponse(
        { error: "인증이 필요합니다. 로그인 후 다시 시도해주세요." },
        401
      );
    }

    console.log(
      `[update-trend-backprop] start — period=${period_days}d, min_sim=${min_similarity}, by=${triggered_by}`
    );

    const startMs = Date.now();

    // ── RPC 호출 ─────────────────────────────────────────────
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "update_factory_trend_scores",
      {
        period_days,
        min_similarity,
      }
    );

    if (rpcErr) {
      throw new Error(`update_factory_trend_scores RPC 오류: ${rpcErr.message}`);
    }

    const results = (rpcData ?? []) as BackpropRow[];
    const factoriesUpdated = results.length;

    // ── 이력 저장 ─────────────────────────────────────────────
    await supabase
      .from("trend_backprop_runs")
      .insert({
        period_days,
        min_similarity,
        factories_updated: factoriesUpdated,
        triggered_by,
      });

    const durationMs = Date.now() - startMs;

    console.log(
      `[update-trend-backprop] done — ${factoriesUpdated} factories updated in ${durationMs}ms`
    );

    return jsonResponse({
      success: true,
      factories_updated: factoriesUpdated,
      period_days,
      min_similarity,
      triggered_by,
      duration_ms: durationMs,
      results: results.map((r) => ({
        factory_id: r.factory_id,
        factory_name: r.factory_name,
        trend_match_score: r.trend_match_score,
        matched_count: r.matched_count,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("update-trend-backprop error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function shouldRun(
  schedule: string,
  trendTime: string,
  lastRunAt: string | null,
  now: Date
): boolean {
  const [hh, mm] = (trendTime || "09:00").split(":").map(Number);
  const nowH = now.getUTCHours();
  const nowM = now.getUTCMinutes();

  // Check if we're within 30 min window of scheduled time
  const scheduledMinutes = hh * 60 + mm;
  const currentMinutes = nowH * 60 + nowM;
  const diff = Math.abs(currentMinutes - scheduledMinutes);
  if (diff > 30 && diff < 1410) return false; // not within window (accounting for midnight wrap)

  const lastRun = lastRunAt ? new Date(lastRunAt) : null;
  const hoursSinceLastRun = lastRun
    ? (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)
    : Infinity;

  switch (schedule) {
    case "hourly":
      return hoursSinceLastRun >= 1;
    case "daily":
      return hoursSinceLastRun >= 23;
    case "weekly":
      return hoursSinceLastRun >= 167; // ~7 days
    default:
      return hoursSinceLastRun >= 23;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const now = new Date();

    // 1. Get active schedules with trend_auto enabled
    const { data: schedules, error: schedErr } = await supabase
      .from("trend_schedules")
      .select("*")
      .eq("is_active", true);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active schedules" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const schedule of schedules) {
      const extra = (schedule as any);
      const trendAuto = extra.trend_auto ?? true; // default true for backward compat
      if (!trendAuto) continue;

      const trendSchedule = extra.trend_schedule || "daily";
      const trendTime = extra.trend_time || "09:00";

      if (!shouldRun(trendSchedule, trendTime, schedule.last_run_at, now)) {
        results.push({
          user_id: schedule.user_id,
          status: "skipped",
          reason: "Not yet time to run",
        });
        continue;
      }

      try {
        // Call collect-sns-trends
        const snsRes = await fetch(
          `${supabaseUrl}/functions/v1/collect-sns-trends`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              source: "all",
              limit: 20,
              user_id: schedule.user_id,
            }),
          }
        );
        const snsData = snsRes.ok ? await snsRes.json() : { error: "SNS call failed" };

        // Call collect-magazine-trends
        const magRes = await fetch(
          `${supabaseUrl}/functions/v1/collect-magazine-trends`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              limit: 10,
              user_id: schedule.user_id,
            }),
          }
        );
        const magData = magRes.ok ? await magRes.json() : { error: "Magazine call failed" };

        // Update last_run_at
        await supabase
          .from("trend_schedules")
          .update({ last_run_at: now.toISOString() })
          .eq("id", schedule.id);

        results.push({
          user_id: schedule.user_id,
          status: "success",
          sns: snsData,
          magazine: magData,
        });
      } catch (userErr: any) {
        console.error(`Schedule error for ${schedule.user_id}:`, userErr);
        results.push({
          user_id: schedule.user_id,
          status: "error",
          message: userErr.message,
        });
      }
    }

    // 2. Cleanup: delete trend_analyses older than 30 days
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: deleteErr, count } = await supabase
      .from("trend_analyses")
      .delete()
      .lt("created_at", thirtyDaysAgo);

    if (deleteErr) {
      console.error("Cleanup error:", deleteErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        cleanup: { deleted_before: thirtyDaysAgo, deleted_count: count ?? 0 },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scheduled-trend-collector error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

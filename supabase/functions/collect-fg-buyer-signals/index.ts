import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// DECOMMISSIONED 2026-05
// Mock 바이어 시그널 생성기는 KPI 정확도 저해로 폐기.
// 실 사용자 시그널은 클라이언트 INSERT(useBuyerSignalTracker / ImageTrendTab)로
// 직접 fg_buyer_signals에 인입됨.
// 함수는 cron/외부 호출 호환을 위해 살려두되 no-op으로 응답.
// ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: true,
      disabled: true,
      saved: 0,
      signal_rows: 0,
      trend_rows: 0,
      reason: "Mock generator decommissioned 2026-05",
      note: "실 사용자 시그널은 클라이언트 INSERT로 직접 인입됨",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

// Webhook endpoint for external crawler to push Phase 1 AI scoring results.
// Auth: Bearer token must match WEBHOOK_SECRET env.
// Match key: shop_id (looked up against public.factories).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const inRange = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10;

// Map payload key -> factories column + scoring_criteria.name (Korean) for FK lookup
const SCORE_FIELDS = [
  { payload: "p1_self_shipping",  column: "p1_self_shipping_score",  criteriaName: "자체 발송 능력" },
  { payload: "p1_image_quality",  column: "p1_image_quality_score",  criteriaName: "상품 이미지 품질" },
  { payload: "p1_moq",            column: "p1_moq_score",            criteriaName: "MOQ 유연성" },
  { payload: "p1_lead_time",      column: "p1_lead_time_score",      criteriaName: "납기 신뢰도" },
  { payload: "p1_communication",  column: "p1_communication_score",  criteriaName: "커뮤니케이션" },
  { payload: "p1_variety",        column: "p1_variety_score",        criteriaName: "상품 다양성" },
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  // 1. Auth
  const expected = Deno.env.get("WEBHOOK_SECRET");
  if (!expected) {
    console.error("WEBHOOK_SECRET not configured");
    return json({ success: false, error: "Server misconfigured" }, 500);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7) !== expected) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  // 2. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const shopId = typeof body.shop_id === "string" ? body.shop_id.trim() : "";
  if (!shopId) {
    return json({ success: false, error: "shop_id is required" }, 400);
  }

  // Validate score fields (each optional, but if present must be 0-10)
  for (const f of SCORE_FIELDS) {
    if (body[f.payload] !== undefined && !inRange(body[f.payload])) {
      return json({
        success: false,
        error: `${f.payload} must be a number between 0 and 10`,
      }, 400);
    }
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 3. Look up factory by shop_id
  const { data: factory, error: lookupErr } = await supabase
    .from("factories")
    .select("id, name, user_id, shop_id, ai_scored_at")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupErr) {
    console.error("Factory lookup failed:", lookupErr);
    return json({ success: false, error: `Lookup failed: ${lookupErr.message}` }, 500);
  }
  if (!factory) {
    console.warn(`Factory not found for shop_id: ${shopId}`);
    return json({
      success: false,
      error: `Factory not found for shop_id: ${shopId}`,
    }, 404);
  }

  // 4. Build update payload (only set provided scores)
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    p1_crawled_at: now,
    score_status: "ai_scored",
  };
  // ai_scored_at: only set if previously NULL
  if (!factory.ai_scored_at) {
    update.ai_scored_at = now;
  }
  for (const f of SCORE_FIELDS) {
    if (body[f.payload] !== undefined) {
      update[f.column] = body[f.payload];
    }
  }
  if (typeof body.alibaba_detected === "boolean") {
    update.alibaba_detected = body.alibaba_detected;
  }
  if (typeof body.alibaba_url === "string" && body.alibaba_url.length > 0) {
    update.alibaba_url = body.alibaba_url;
  }

  const { error: updateErr } = await supabase
    .from("factories")
    .update(update)
    .eq("id", factory.id);

  if (updateErr) {
    console.error("Factory update failed:", updateErr);
    return json({ success: false, error: `Update failed: ${updateErr.message}` }, 500);
  }

  // 5. Best-effort: upsert factory_scores rows by mapping payload key -> scoring_criteria.name
  let scoresInserted = 0;
  const scoresWarnings: string[] = [];

  const providedFields = SCORE_FIELDS.filter((f) => body[f.payload] !== undefined);

  if (providedFields.length > 0) {
    // Look up criteria for this factory's owner
    const { data: criteria, error: critErr } = await supabase
      .from("scoring_criteria")
      .select("id, name")
      .eq("user_id", factory.user_id)
      .in("name", providedFields.map((f) => f.criteriaName));

    if (critErr) {
      scoresWarnings.push(`scoring_criteria lookup failed: ${critErr.message}`);
    } else {
      const nameToId = new Map<string, string>(
        (criteria ?? []).map((c: { id: string; name: string }) => [c.name, c.id]),
      );

      const rows = providedFields
        .map((f) => {
          const criteriaId = nameToId.get(f.criteriaName);
          if (!criteriaId) {
            scoresWarnings.push(`No scoring_criteria match for "${f.criteriaName}" (payload: ${f.payload})`);
            return null;
          }
          return {
            factory_id: factory.id,
            criteria_id: criteriaId,
            score: body[f.payload] as number,
            ai_original_score: body[f.payload] as number,
            notes: JSON.stringify({
              criteria_key: f.payload,
              source: "crawler-webhook",
              raw_note: typeof body.raw_note === "string" ? body.raw_note : null,
            }),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        // Upsert on (factory_id, criteria_id) unique constraint
        const { error: upsertErr, count } = await supabase
          .from("factory_scores")
          .upsert(rows, { onConflict: "factory_id,criteria_id", count: "exact" });
        if (upsertErr) {
          scoresWarnings.push(`factory_scores upsert failed: ${upsertErr.message}`);
          console.error("factory_scores upsert failed:", upsertErr);
        } else {
          scoresInserted = count ?? rows.length;
        }
      }
    }
  }

  console.log(`✓ Webhook OK: ${factory.name} (${shopId}) — ${scoresInserted} scores, ${scoresWarnings.length} warnings`);

  return json({
    success: true,
    factory_id: factory.id,
    shop_id: shopId,
    factory_name: factory.name,
    scores_inserted: scoresInserted,
    scores_warnings: scoresWarnings,
  });
});

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

// Map payload keys -> factories column + criteria_key (used in factory_scores notes)
const SCORE_FIELDS = [
  { payload: "p1_self_shipping",  column: "p1_self_shipping_score",  key: "p1_self_shipping" },
  { payload: "p1_image_quality",  column: "p1_image_quality_score",  key: "p1_image_quality" },
  { payload: "p1_moq",            column: "p1_moq_score",            key: "p1_moq" },
  { payload: "p1_lead_time",      column: "p1_lead_time_score",      key: "p1_lead_time" },
  { payload: "p1_communication",  column: "p1_communication_score",  key: "p1_communication" },
  { payload: "p1_variety",        column: "p1_variety_score",        key: "p1_variety" },
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
    .select("id, name, user_id, shop_id")
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
    ai_scored_at: now,
    score_status: "ai_scored",
  };
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

  // 5. Insert one factory_scores row per provided indicator (criteria_key stored in notes)
  const scoreRows = SCORE_FIELDS
    .filter((f) => body[f.payload] !== undefined)
    .map((f) => ({
      factory_id: factory.id,
      criteria_id: factory.id, // placeholder: no scoring_criteria row for crawler keys
      score: body[f.payload] as number,
      ai_original_score: body[f.payload] as number,
      notes: JSON.stringify({
        criteria_key: f.key,
        source: "crawler-webhook",
        raw_note: typeof body.raw_note === "string" ? body.raw_note : null,
      }),
    }));

  let scoresInserted = 0;
  if (scoreRows.length > 0) {
    const { error: insertErr, count } = await supabase
      .from("factory_scores")
      .insert(scoreRows, { count: "exact" });
    if (insertErr) {
      // Non-fatal: factories row already updated. Log + report.
      console.error("factory_scores insert failed:", insertErr);
    } else {
      scoresInserted = count ?? scoreRows.length;
    }
  }

  console.log(`✓ Webhook OK: ${factory.name} (${shopId}) — ${scoresInserted} scores`);

  return json({
    success: true,
    factory_id: factory.id,
    shop_id: shopId,
    scores_inserted: scoresInserted,
    factory_name: factory.name,
  });
});

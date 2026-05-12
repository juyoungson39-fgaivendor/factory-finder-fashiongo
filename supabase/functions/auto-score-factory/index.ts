import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireUserAuth } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUserAuth(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const { factory_id } = await req.json();
    if (!factory_id) {
      return new Response(JSON.stringify({ error: "factory_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Load factory data (and verify ownership)
    const { data: factory, error: factoryErr } = await supabase
      .from("factories")
      .select("*")
      .eq("id", factory_id)
      .single();
    if (factoryErr || !factory) throw new Error("Factory not found");
    if (factory.user_id !== auth.userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load ACTIVE scoring criteria only
    const { data: criteria, error: criteriaErr } = await supabase
      .from("scoring_criteria")
      .select("*")
      .eq("user_id", factory.user_id)
      .eq("is_active", true)
      .order("sort_order");
    if (criteriaErr) throw new Error("Failed to load scoring criteria");
    if (!criteria || criteria.length === 0) {
      return new Response(JSON.stringify({ error: "No scoring criteria configured", scores: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Load existing scores (do NOT early return — we'll upsert / preserve human corrections)
    const { data: existingScores } = await supabase
      .from("factory_scores")
      .select("id, criteria_id, score, ai_original_score")
      .eq("factory_id", factory_id);
    const existingByCriteria = new Map<string, { id: string; score: number; ai_original_score: number | null }>(
      (existingScores ?? []).map((s: any) => [s.criteria_id, s])
    );

    // 4. Build AI prompt — include parsed crawl data + p1 scores + non-null platform detail
    const criteriaList = criteria
      .map((c: any) => `- "${c.name}" (id: "${c.id}", max_score: ${c.max_score}, weight: ${c.weight}): ${c.description || "N/A"}`)
      .join("\n");

    // Filter non-null fields from platform_score_detail
    const psd = (factory.platform_score_detail ?? {}) as Record<string, unknown>;
    const psdNonNull: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(psd)) {
      if (v !== null && v !== undefined && v !== "") psdNonNull[k] = v;
    }

    // Pull parsed crawl data (richest signal)
    const rawParsed = (factory.raw_crawl_data as any)?.parsed ?? null;
    const verifiedReport = (factory.raw_crawl_data as any)?.verified_report ?? factory.verified_report_data ?? null;

    // Phase 1 reference scores (already computed by crawler)
    const p1Reference = {
      self_shipping: factory.p1_self_shipping_score,
      image_quality: factory.p1_image_quality_score,
      moq: factory.p1_moq_score,
      lead_time: factory.p1_lead_time_score,
      communication: factory.p1_communication_score,
      variety: factory.p1_variety_score,
    };

    const factoryInfo = JSON.stringify({
      name: factory.name,
      country: factory.country,
      city: factory.city,
      main_products: factory.main_products,
      moq: factory.moq,
      lead_time: factory.lead_time,
      description: factory.description,
      source_platform: factory.source_platform,
      fg_category: factory.fg_category,
      certifications: factory.certifications,
      // Rich signals ↓
      platform_score_detail_non_null: psdNonNull,
      raw_crawl_parsed: rawParsed,
      verified_report: verifiedReport,
      p1_reference_scores: p1Reference,
      review_score: factory.review_score,
      review_count: factory.review_count,
      response_time_hours: factory.response_time_hours,
      on_time_delivery_rate: factory.on_time_delivery_rate,
      transaction_volume_usd: factory.transaction_volume_usd,
      gold_supplier_years: factory.gold_supplier_years,
      trade_assurance: factory.trade_assurance,
      main_markets: factory.main_markets,
      capabilities: factory.capabilities,
      sub_category_count: factory.sub_category_count,
      production_tab_count: factory.production_tab_count,
    }, null, 2);

    const rubricBlock = criteria
      .map((c: any, i: number) => `${i + 1}. "${c.name}" (id: "${c.id}", max: ${c.max_score}, weight: ${c.weight})\n   기준: ${c.description || "N/A"}`)
      .join("\n");

    const systemPrompt = `You are a vendor evaluation specialist for the North American wholesale fashion market.
Score this factory/supplier based on the available information.

평가 항목 (각 항목의 "기준"에 명시된 임계치를 그대로 적용하세요):
${rubricBlock}

CRITICAL — when data is missing for a criterion:
- Return score: null (NOT a default 5)
- Set notes to "데이터 미확보 - <어떤 필드가 없는지 1줄>"

Use the p1_reference_scores as anchor when available — your final score must not deviate by more than 2 points from the corresponding p1 reference unless the rubric clearly contradicts it.

Return ONLY valid JSON (no markdown code blocks):
{
  "scores": [
    { "criteria_id": "uuid", "score": number_or_null, "notes": "Korean reasoning citing actual values (1-2 sentences)" }
  ]
}

IMPORTANT:
- Provide an entry for ALL ${criteria.length} criteria.
- Notes must be in Korean and cite specific numbers (e.g., "응답시간 2h, OTD 98%").
- Do NOT default to 5 — return null if there is no relevant data.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `다음 공장을 평가해주세요:\n${factoryInfo}` },
    ];

    // 5. Call AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, temperature: 0.1 }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error(`AI request failed: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const result = JSON.parse(jsonStr);

    // 6. Upsert scores — preserve human corrections (score != ai_original_score)
    //    - New rows: score = ai_original_score = new AI score
    //    - Existing uncorrected rows: overwrite both
    //    - Existing corrected rows: keep score, only refresh ai_original_score
    let preservedCount = 0;
    const scoreInserts = (result.scores || [])
      .filter((s: any) => s.criteria_id)
      .map((s: any) => {
        const maxScore = criteria.find((c: any) => c.id === s.criteria_id)?.max_score || 10;
        const isNull = s.score === null || s.score === undefined;
        const newAiScore = isNull ? 0 : Math.min(Number(s.score), maxScore);
        const finalNotes = isNull
          ? (typeof s.notes === "string" && s.notes.includes("데이터 미확보")
              ? s.notes
              : `데이터 미확보 - ${s.notes || "관련 정보 없음"}`)
          : (s.notes || null);

        const existing = existingByCriteria.get(s.criteria_id);
        const isHumanCorrected =
          existing &&
          existing.ai_original_score !== null &&
          Number(existing.score) !== Number(existing.ai_original_score);

        if (isHumanCorrected) {
          preservedCount += 1;
          return {
            factory_id,
            criteria_id: s.criteria_id,
            score: existing!.score, // preserve human-corrected score
            ai_original_score: newAiScore, // refresh AI baseline only
            notes: finalNotes,
          };
        }

        return {
          factory_id,
          criteria_id: s.criteria_id,
          score: newAiScore,
          ai_original_score: newAiScore,
          notes: finalNotes,
        };
      });

    if (scoreInserts.length > 0) {
      const { error: upsertErr } = await supabase
        .from("factory_scores")
        .upsert(scoreInserts, { onConflict: "factory_id,criteria_id" });
      if (upsertErr) throw new Error(`Score upsert failed: ${upsertErr.message}`);

      await supabase.rpc("recalculate_factory_score", { p_factory_id: factory_id });
    }

    // 7. Store AI original data
    await supabase.from("factories").update({
      ai_original_score: factory.overall_score,
      ai_original_data: { auto_scored: true, scored_at: new Date().toISOString(), criteria_count: scoreInserts.length },
    }).eq("id", factory_id);

    return new Response(JSON.stringify({
      success: true,
      scores_count: scoreInserts.length,
      preserved_human_corrections: preservedCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("auto-score-factory error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

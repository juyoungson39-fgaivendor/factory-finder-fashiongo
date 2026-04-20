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

    // 2. Load scoring criteria
    const { data: criteria, error: criteriaErr } = await supabase
      .from("scoring_criteria")
      .select("*")
      .eq("user_id", factory.user_id)
      .order("sort_order");
    if (criteriaErr) throw new Error("Failed to load scoring criteria");
    if (!criteria || criteria.length === 0) {
      return new Response(JSON.stringify({ error: "No scoring criteria configured", scores: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Check if scores already exist
    const { data: existingScores } = await supabase
      .from("factory_scores")
      .select("id")
      .eq("factory_id", factory_id);
    if (existingScores && existingScores.length > 0) {
      return new Response(JSON.stringify({ message: "Scores already exist", scores: existingScores }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Build AI prompt
    const criteriaList = criteria
      .map((c: any) => `- "${c.name}" (id: "${c.id}", max_score: ${c.max_score}, weight: ${c.weight}): ${c.description || "N/A"}`)
      .join("\n");

    const factoryInfo = JSON.stringify({
      name: factory.name,
      country: factory.country,
      city: factory.city,
      main_products: factory.main_products,
      moq: factory.moq,
      lead_time: factory.lead_time,
      description: factory.description,
      source_platform: factory.source_platform,
      platform_score: factory.platform_score,
      platform_score_detail: factory.platform_score_detail,
      repurchase_rate: factory.repurchase_rate,
      years_on_platform: factory.years_on_platform,
      certifications: factory.certifications,
      fg_category: factory.fg_category,
      recommendation_grade: factory.recommendation_grade,
    });

    const systemPrompt = `You are a vendor evaluation specialist for the North American wholesale fashion market.
Score this factory/supplier based on the available information.
If information for a criterion is missing, give a conservative mid-range score and note it.

Scoring Criteria:
${criteriaList}

Return ONLY valid JSON (no markdown code blocks):
{
  "scores": [
    { "criteria_id": "uuid", "score": number, "notes": "Korean reasoning (1-2 sentences)" }
  ]
}

IMPORTANT:
- Score each criterion on a scale of 0 to its max_score
- Provide scores for ALL ${criteria.length} criteria
- Notes must be in Korean
- Be fair and balanced based on available data`;

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

    // 6. Insert scores
    const scoreInserts = (result.scores || [])
      .filter((s: any) => s.criteria_id && typeof s.score === "number")
      .map((s: any) => ({
        factory_id,
        criteria_id: s.criteria_id,
        score: Math.min(s.score, criteria.find((c: any) => c.id === s.criteria_id)?.max_score || 10),
        ai_original_score: Math.min(s.score, criteria.find((c: any) => c.id === s.criteria_id)?.max_score || 10),
        notes: s.notes || null,
      }));

    if (scoreInserts.length > 0) {
      const { error: insertErr } = await supabase.from("factory_scores").insert(scoreInserts);
      if (insertErr) throw new Error(`Score insert failed: ${insertErr.message}`);

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
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("auto-score-factory error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

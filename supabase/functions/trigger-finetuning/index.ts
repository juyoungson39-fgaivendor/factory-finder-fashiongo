import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getAccessToken } from "../_shared/google-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- ENV ---
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SERVICE_ACCOUNT_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const PROJECT = Deno.env.get("GOOGLE_CLOUD_PROJECT");
    const LOCATION = Deno.env.get("GOOGLE_CLOUD_LOCATION") || "us-central1";
    const GCS_BUCKET = Deno.env.get("GCS_TRAINING_BUCKET");

    if (!SERVICE_ACCOUNT_KEY || !PROJECT || !GCS_BUCKET) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing GCP env vars (GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_CLOUD_PROJECT, GCS_TRAINING_BUCKET)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Auth: extract user from request ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 1: Collect training data ---
    // 1a. Corrections (수정 데이터)
    const { data: corrections } = await supabase
      .from("scoring_corrections")
      .select("*, factories!scoring_corrections_vendor_id_fkey(name, country, city, main_products, moq, lead_time, description, platform_score_detail)")
      .eq("is_valid", true)
      .is("used_in_version", null);

    // 1b. Confirmed factories (정답 데이터)
    const { data: confirmedFactories } = await supabase
      .from("factories")
      .select("*, factory_scores(criteria_id, score, ai_original_score, notes, scoring_criteria(name, weight, max_score, description))")
      .eq("score_confirmed", true)
      .is("deleted_at", null);

    // 1c. Deleted factories (부적합 데이터)
    const { data: deletedFactories } = await supabase
      .from("factories")
      .select("*, factory_scores(criteria_id, score, ai_original_score, notes, scoring_criteria(name, weight, max_score, description))")
      .not("deleted_at", "is", null);

    // 1d. Scoring criteria for system prompt
    const { data: allCriteria } = await supabase
      .from("scoring_criteria")
      .select("*")
      .order("sort_order");

    const correctionCount = corrections?.length ?? 0;
    const confirmedCount = confirmedFactories?.length ?? 0;
    const deletedCount = deletedFactories?.length ?? 0;
    const totalCount = correctionCount + confirmedCount + deletedCount;

    if (totalCount < 1) { // TODO: 테스트 후 100으로 복구
      return new Response(
        JSON.stringify({
          success: false,
          error: `학습 데이터 부족: ${totalCount}건 (최소 100건 필요)`,
          counts: { corrections: correctionCount, confirmed: confirmedCount, deleted: deletedCount },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 2: Build system prompt ---
    const criteriaPrompt = (allCriteria ?? []).map(c =>
      `- "${c.name}" (id: "${c.id}", max_score: ${c.max_score}, weight: ${c.weight}): ${c.description || ""}`
    ).join("\n");

    const systemPrompt = `You are a vendor evaluation specialist for the North American wholesale fashion market.
Score this factory/supplier based on the available information.

Scoring Criteria:
${criteriaPrompt}

Return ONLY valid JSON:
{
  "overall_score": 0-100,
  "reasoning_ko": "Korean explanation of scoring",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "scores": [{ "criteria_id": "id", "score": 0, "notes": "reason in Korean" }]
}`;

    // --- Step 3: Convert to JSONL ---
    const jsonlLines: string[] = [];

    // 3a. Correction data → corrected scores as ideal output
    for (const corr of (corrections ?? [])) {
      const factory = corr.factories;
      if (!factory) continue;

      const userContent = `Evaluate this factory:\n${JSON.stringify({
        name: factory.name, country: factory.country, city: factory.city,
        main_products: factory.main_products, moq: factory.moq,
        lead_time: factory.lead_time, description: factory.description,
        platform_scores: factory.platform_score_detail,
      })}`;

      // Build corrected response (use corrected_score for this criteria, keep others)
      const assistantContent = JSON.stringify({
        scores: [{ criteria_id: corr.criteria_key, score: corr.corrected_score, notes: corr.reason }],
      });

      jsonlLines.push(JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
          { role: "assistant", content: assistantContent },
        ],
      }));
    }

    // 3b. Confirmed factories → AI scores as correct output
    for (const factory of (confirmedFactories ?? [])) {
      const factoryScores = factory.factory_scores as Array<{
        criteria_id: string; score: number; ai_original_score: number | null;
        notes: string | null; scoring_criteria: { name: string; weight: number; max_score: number; description: string | null } | null;
      }>;
      if (!factoryScores?.length) continue;

      const userContent = `Evaluate this factory:\n${JSON.stringify({
        name: factory.name, country: factory.country, city: factory.city,
        main_products: factory.main_products, moq: factory.moq,
        lead_time: factory.lead_time, description: factory.description,
        platform_scores: factory.platform_score_detail,
      })}`;

      const assistantContent = JSON.stringify({
        overall_score: factory.overall_score,
        scores: factoryScores.map(s => ({
          criteria_id: s.criteria_id,
          score: Number(s.score),
          notes: s.notes || "Confirmed as correct",
        })),
      });

      jsonlLines.push(JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
          { role: "assistant", content: assistantContent },
        ],
      }));
    }

    // 3c. Deleted factories → low/zero overall score with deletion reason
    for (const factory of (deletedFactories ?? [])) {
      const userContent = `Evaluate this factory:\n${JSON.stringify({
        name: factory.name, country: factory.country, city: factory.city,
        main_products: factory.main_products, moq: factory.moq,
        lead_time: factory.lead_time, description: factory.description,
        platform_scores: factory.platform_score_detail,
      })}`;

      const assistantContent = JSON.stringify({
        overall_score: 0,
        reasoning_ko: `소싱 부적합 — ${factory.deleted_reason || "사유 미입력"}`,
        weaknesses: [factory.deleted_reason || "소싱 기준 미달"],
        scores: [],
      });

      jsonlLines.push(JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
          { role: "assistant", content: assistantContent },
        ],
      }));
    }

    const jsonlContent = jsonlLines.join("\n");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const gcsFileName = `training-data/finetuning-${timestamp}.jsonl`;

    // --- Step 4: Upload to GCS ---
    const accessToken = await getAccessToken(SERVICE_ACCOUNT_KEY);

    const uploadRes = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodeURIComponent(gcsFileName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/jsonl",
        },
        body: jsonlContent,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`GCS upload failed (${uploadRes.status}): ${errText}`);
    }

    const gcsUri = `gs://${GCS_BUCKET}/${gcsFileName}`;

    // --- Step 5: Create Vertex AI Fine-tuning Job ---
    const tuningJobBody = {
      baseModel: "gemini-2.5-flash",
      supervisedTuningSpec: {
        trainingDatasetUri: gcsUri,
      },
      tunedModelDisplayName: `fg-scorer-${timestamp}`,
    };

    const tuningRes = await fetch(
      `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/tuningJobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tuningJobBody),
      }
    );

    if (!tuningRes.ok) {
      const errText = await tuningRes.text();
      throw new Error(`Vertex AI tuning job creation failed (${tuningRes.status}): ${errText}`);
    }

    const tuningJob = await tuningRes.json();

    // --- Step 6: Record in DB ---
    const { error: insertError } = await supabase.from("ai_training_jobs").insert({
      model_type: "scoring",
      status: "PENDING",
      vertex_job_name: tuningJob.name || null,
      training_data_count: totalCount,
      training_file_uri: gcsUri,
      user_id: user.id,
    });

    if (insertError) {
      console.error("Failed to insert training job record:", insertError);
    }

    // Mark corrections as used
    if (corrections?.length) {
      const correctionIds = corrections.map(c => c.id);
      await supabase
        .from("scoring_corrections")
        .update({ used_in_version: tuningJob.name || timestamp })
        .in("id", correctionIds);
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_name: tuningJob.name,
        training_file: gcsUri,
        counts: { corrections: correctionCount, confirmed: confirmedCount, deleted: deletedCount, total: totalCount },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("trigger-finetuning error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

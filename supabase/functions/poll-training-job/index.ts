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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SERVICE_ACCOUNT_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    const LOCATION = Deno.env.get("GOOGLE_CLOUD_LOCATION") || "us-central1";

    if (!SERVICE_ACCOUNT_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing GOOGLE_SERVICE_ACCOUNT_KEY" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth: allow Supabase user OR cron secret
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET");
    const reqCronSecret = req.headers.get("X-Cron-Secret");

    let authorized = false;

    // Check cron secret (for Cloud Scheduler)
    if (cronSecret && reqCronSecret === cronSecret) {
      authorized = true;
    }

    // Check Supabase user auth (for frontend calls)
    if (!authorized) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) authorized = true;
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find running/pending jobs
    const { data: jobs } = await supabase
      .from("ai_training_jobs")
      .select("*")
      .in("status", ["PENDING", "RUNNING", "pending", "running"])
      .order("created_at", { ascending: false });

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active jobs", jobs: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken(SERVICE_ACCOUNT_KEY);
    const results = [];

    for (const job of jobs) {
      if (!job.vertex_job_name) continue;

      // Query Vertex AI for actual job status
      const vertexRes = await fetch(
        `https://${LOCATION}-aiplatform.googleapis.com/v1/${job.vertex_job_name}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!vertexRes.ok) {
        results.push({ id: job.id, error: `Vertex API error: ${vertexRes.status}` });
        continue;
      }

      const vertexJob = await vertexRes.json();
      const vertexState = vertexJob.state; // JOB_STATE_RUNNING, JOB_STATE_SUCCEEDED, JOB_STATE_FAILED, etc.

      // Map Vertex AI state to our status
      let newStatus = job.status;
      let errorMessage = null;
      let tunedModelName = null;

      if (vertexState === "JOB_STATE_SUCCEEDED") {
        newStatus = "SUCCEEDED";
        tunedModelName = vertexJob.tunedModel?.model || vertexJob.tunedModel?.endpoint || null;
      } else if (vertexState === "JOB_STATE_FAILED") {
        newStatus = "FAILED";
        errorMessage = vertexJob.error?.message || "Unknown error";
      } else if (vertexState === "JOB_STATE_CANCELLED") {
        newStatus = "FAILED";
        errorMessage = "Job was cancelled";
      } else if (vertexState === "JOB_STATE_RUNNING") {
        newStatus = "RUNNING";
      }

      // Update DB (only columns that exist in the table)
      const updateData: Record<string, unknown> = {
        status: newStatus,
      };

      if (errorMessage) updateData.error_message = errorMessage;
      if (tunedModelName) updateData.result_endpoint = tunedModelName;
      if (vertexJob.startTime && !job.started_at) updateData.started_at = vertexJob.startTime;
      if (vertexJob.endTime) updateData.completed_at = vertexJob.endTime;

      await supabase
        .from("ai_training_jobs")
        .update(updateData)
        .eq("id", job.id);

      results.push({
        id: job.id,
        vertex_state: vertexState,
        new_status: newStatus,
        tuned_model: tunedModelName,
        error: errorMessage,
      });
    }

    return new Response(
      JSON.stringify({ success: true, jobs: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("poll-training-job error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

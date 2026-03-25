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

    // Helper: fetch Tensorboard training metrics for a tuning job
    async function fetchTrainingMetrics(
      vertexJob: Record<string, unknown>,
      token: string,
    ): Promise<Record<string, unknown> | null> {
      try {
        const experimentCtx = vertexJob.experiment as string | undefined;
        if (!experimentCtx) return null;

        // Extract experiment ID from metadata context path
        // e.g. "projects/.../metadataStores/default/contexts/tuning-experiment-xxx"
        const expId = experimentCtx.split("/contexts/").pop();
        if (!expId) return null;

        // Get hyperParameters for total epoch count
        const spec = vertexJob.supervisedTuningSpec as Record<string, unknown> | undefined;
        const hyperParams = spec?.hyperParameters as Record<string, unknown> | undefined;
        const epochCount = Number(hyperParams?.epochCount) || 40;

        // Find the Tensorboard resource: list tensorboards in the project
        const nameParts = (vertexJob.name as string).split("/");
        const project = nameParts[1];
        const location = nameParts[3];
        const baseUrl = `https://${location}-aiplatform.googleapis.com/v1`;

        // List tensorboards to find the one linked to this experiment
        const tbListRes = await fetch(
          `${baseUrl}/projects/${project}/locations/${location}/tensorboards?pageSize=10`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!tbListRes.ok) return null;
        const tbList = await tbListRes.json();
        const tensorboards = tbList.tensorboards || [];
        if (tensorboards.length === 0) return null;

        // Try each tensorboard to find the experiment run
        for (const tb of tensorboards) {
          const tbName = tb.name;
          const runPath = `${tbName}/experiments/${expId}/runs/${expId.replace("experiment", "experiment-run")}`;

          // Batch read all time series data
          const tsListRes = await fetch(
            `${baseUrl}/${runPath}/timeSeries?pageSize=20`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!tsListRes.ok) continue;
          const tsList = await tsListRes.json();
          const timeSeries = tsList.tensorboardTimeSeries || [];
          if (timeSeries.length === 0) continue;

          const metrics: Record<string, unknown> = { epoch_count: epochCount };

          // Read data points for each time series
          for (const ts of timeSeries) {
            const tsName = ts.name as string;
            const displayName = (ts.displayName as string).replace(/^\//, "");

            const readRes = await fetch(
              `${baseUrl}/${tsName}:read`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!readRes.ok) continue;
            const readData = await readRes.json();
            const tsData = readData.timeSeriesData;
            const values = tsData?.values || [];

            if (values.length > 0) {
              const latest = values[values.length - 1];
              metrics[displayName] = {
                current_step: values.length,
                latest_value: latest?.scalar?.value ?? null,
                data_points: values.length,
              };
            }
          }

          // Calculate progress from train_total_loss steps
          const trainLoss = metrics.train_total_loss as Record<string, unknown> | undefined;
          if (trainLoss?.current_step) {
            metrics.progress_pct = Math.min(100, Math.round(
              (Number(trainLoss.current_step) / epochCount) * 100
            ));
          }

          return metrics;
        }

        return null;
      } catch (e) {
        console.error("fetchTrainingMetrics error:", e);
        return null;
      }
    }

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

        // Auto-create model version entry if job just transitioned to SUCCEEDED
        if (job.status?.toUpperCase() !== "SUCCEEDED") {
          const jobName = job.vertex_job_name?.split("/").pop() || "unknown";
          const version = `v${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${jobName.slice(-6)}`;

          // Determine next internal_version by finding the max existing one
          const { data: allVersions } = await supabase
            .from("ai_model_versions")
            .select("internal_version")
            .order("created_at", { ascending: false });

          let maxMinor = 0;
          if (allVersions && allVersions.length > 0) {
            for (const v of allVersions) {
              const match = (v.internal_version || "").match(/V1\.(\d+)/);
              if (match) {
                const minor = parseInt(match[1]);
                if (minor > maxMinor) maxMinor = minor;
              }
            }
          }
          const internalVersion = `V1.${maxMinor + 1}`;

          // Deactivate all existing ACTIVE models
          await supabase
            .from("ai_model_versions")
            .update({ status: "INACTIVE" })
            .eq("status", "ACTIVE");

          // Insert new model as ACTIVE
          await supabase.from("ai_model_versions").insert({
            version,
            internal_version: internalVersion,
            status: "ACTIVE",
            base_model: vertexJob.baseModel || "gemini-2.5-flash",
            training_count: job.training_data_count || 0,
            vertex_job_id: jobName,
            deployed_at: new Date().toISOString(),
            user_id: job.user_id,
          });

          // Link scoring_corrections to this model version and mark as learned
          const vertexJobFullName = job.vertex_job_name || "";
          await supabase
            .from("scoring_corrections")
            .update({ used_in_version: version, is_learned: true })
            .eq("used_in_version", `job:${vertexJobFullName}`);

          // Also link any corrections that were marked with the raw job name (legacy)
          await supabase
            .from("scoring_corrections")
            .update({ used_in_version: version, is_learned: true })
            .eq("used_in_version", vertexJobFullName);
        }
      } else if (vertexState === "JOB_STATE_FAILED") {
        newStatus = "FAILED";
        errorMessage = vertexJob.error?.message || "Unknown error";
      } else if (vertexState === "JOB_STATE_CANCELLED") {
        newStatus = "FAILED";
        errorMessage = "Job was cancelled";
      } else if (vertexState === "JOB_STATE_RUNNING") {
        newStatus = "RUNNING";
      }

      // Fetch training metrics for running jobs
      let trainingMetrics: Record<string, unknown> | null = null;
      if (vertexState === "JOB_STATE_RUNNING") {
        // 1. Get epoch count from hyperParameters
        const spec = vertexJob.supervisedTuningSpec as Record<string, unknown> | undefined;
        const hyperParams = spec?.hyperParameters as Record<string, unknown> | undefined;
        const epochCount = Number(hyperParams?.epochCount) || 40;

        // 2. Get checkpoint progress (most reliable source)
        const checkpoints = (vertexJob.tunedModel as Record<string, unknown>)?.checkpoints as
          Array<{ checkpointId: string; epoch: string; step: string }> | undefined;
        const latestCheckpoint = checkpoints?.length
          ? checkpoints[checkpoints.length - 1]
          : null;

        if (latestCheckpoint) {
          const currentEpoch = Number(latestCheckpoint.epoch) || 0;
          trainingMetrics = {
            epoch_count: epochCount,
            current_epoch: currentEpoch,
            current_step: Number(latestCheckpoint.step) || 0,
            progress_pct: Math.min(100, Math.round((currentEpoch / epochCount) * 100)),
            source: "checkpoint",
          };
        }

        // 3. Try Tensorboard metrics for loss/accuracy details
        const tbMetrics = await fetchTrainingMetrics(vertexJob, accessToken);
        if (tbMetrics) {
          trainingMetrics = { ...(trainingMetrics || { epoch_count: epochCount }), ...tbMetrics };
        }
      }

      // Update DB (only columns that exist in the table)
      const updateData: Record<string, unknown> = {
        status: newStatus,
      };

      if (errorMessage) updateData.error_message = errorMessage;
      if (tunedModelName) updateData.result_endpoint = tunedModelName;
      if (vertexJob.startTime && !job.started_at) updateData.started_at = vertexJob.startTime;
      if (vertexJob.endTime) updateData.completed_at = vertexJob.endTime;
      if (trainingMetrics) updateData.training_metrics = trainingMetrics;

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
        metrics: trainingMetrics,
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

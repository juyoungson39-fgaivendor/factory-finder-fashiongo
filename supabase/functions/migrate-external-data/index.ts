import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action } = await req.json();

    const EXTERNAL_URL = "https://zvzqategpvsxaobzolfd.supabase.co";
    const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!EXTERNAL_KEY) throw new Error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not set");

    const CURRENT_URL = Deno.env.get("SUPABASE_URL")!;
    const CURRENT_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const extClient = createClient(EXTERNAL_URL, EXTERNAL_KEY);
    const curClient = createClient(CURRENT_URL, CURRENT_KEY);

    if (action === "explore") {
      const tables = [
        "factories", "factory_scores", "factory_notes", "factory_photos", "factory_tags",
        "products", "product_logs", "profiles", "tags", "scoring_criteria", "scoring_corrections",
        "sourceable_products", "sourcing_target_products", "converted_product_images",
        "fashiongo_queue", "fg_registered_products", "fg_settings",
        "ai_model_versions", "ai_training_jobs",
        "trend_analyses", "trend_matches", "trend_schedules", "user_roles"
      ];

      const results: Record<string, any> = {};
      for (const t of tables) {
        const { data, error, count } = await extClient.from(t).select("*", { count: "exact", head: true });
        results[t] = error ? { error: error.message } : { count };
      }
      return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "migrate") {
      const tables = [
        "profiles", "tags", "scoring_criteria",
        "factories",
        "factory_scores", "factory_notes", "factory_photos", "factory_tags",
        "products", "product_logs",
        "scoring_corrections",
        "sourceable_products", "sourcing_target_products",
        "converted_product_images", "fashiongo_queue",
        "fg_registered_products", "fg_settings",
        "ai_model_versions", "ai_training_jobs",
        "trend_analyses", "trend_matches", "trend_schedules",
        "user_roles"
      ];

      const migrationLog: Record<string, any> = {};

      for (const t of tables) {
        try {
          // Fetch all from external (paginated)
          let allRows: any[] = [];
          let from = 0;
          const pageSize = 500;
          while (true) {
            const { data, error } = await extClient.from(t).select("*").range(from, from + pageSize - 1);
            if (error) { migrationLog[t] = { error: error.message }; break; }
            if (!data || data.length === 0) break;
            allRows = allRows.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
          }

          if (allRows.length === 0) {
            migrationLog[t] = { skipped: true, reason: "no data" };
            continue;
          }

          // Upsert into current project
          const { error: insertError } = await curClient.from(t).upsert(allRows, { onConflict: "id", ignoreDuplicates: true });
          if (insertError) {
            migrationLog[t] = { error: insertError.message, rows_attempted: allRows.length };
          } else {
            migrationLog[t] = { success: true, rows_migrated: allRows.length };
          }
        } catch (e) {
          migrationLog[t] = { error: String(e) };
        }
      }

      return new Response(JSON.stringify(migrationLog), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "migrate-storage") {
      const buckets = ["factory-photos", "ai-generated-images"];
      const storageLog: Record<string, any> = {};

      for (const bucket of buckets) {
        try {
          const { data: files, error } = await extClient.storage.from(bucket).list("", { limit: 1000 });
          if (error) { storageLog[bucket] = { error: error.message }; continue; }
          if (!files || files.length === 0) { storageLog[bucket] = { skipped: true, reason: "empty" }; continue; }

          let copied = 0;
          let errors: string[] = [];

          // Recursively list and copy
          async function copyDir(path: string) {
            const { data: items } = await extClient.storage.from(bucket).list(path, { limit: 1000 });
            if (!items) return;
            for (const item of items) {
              const fullPath = path ? `${path}/${item.name}` : item.name;
              if (item.id === null) {
                // It's a folder
                await copyDir(fullPath);
              } else {
                // It's a file - download and re-upload
                const { data: fileData, error: dlError } = await extClient.storage.from(bucket).download(fullPath);
                if (dlError || !fileData) { errors.push(`dl:${fullPath}`); continue; }
                const { error: upError } = await curClient.storage.from(bucket).upload(fullPath, fileData, { upsert: true });
                if (upError) { errors.push(`up:${fullPath}:${upError.message}`); continue; }
                copied++;
              }
            }
          }

          await copyDir("");
          storageLog[bucket] = { copied, errors: errors.slice(0, 10) };
        } catch (e) {
          storageLog[bucket] = { error: String(e) };
        }
      }

      return new Response(JSON.stringify(storageLog), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

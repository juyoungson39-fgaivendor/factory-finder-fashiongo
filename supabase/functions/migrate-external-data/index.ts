import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTERNAL_URL = "https://zvzqategpvsxaobzolfd.supabase.co";

// Tables we want to inspect on the external DB (mirrors current schema)
const TABLES_TO_SCAN = [
  "factories", "factory_scores", "factory_notes", "factory_photos", "factory_tags",
  "products", "sourceable_products", "sourcing_target_products", "sourcing_reports",
  "trend_analyses", "trend_matches", "trend_schedules", "trend_backprop_runs",
  "fg_registered_products", "fg_settings", "fg_buyer_signals",
  "fashiongo_queue", "product_logs", "profiles", "user_roles", "tags",
  "scoring_criteria", "scoring_corrections",
  "ai_model_versions", "ai_training_jobs", "batch_runs",
  "converted_product_images", "vendor_model_settings",
];

const BUCKETS_TO_SCAN = ["factory-photos", "ai-generated-images"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { action, bucket, folder, offset = 0, limit = 10 } = body;

    const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const CURRENT_URL = Deno.env.get("SUPABASE_URL")!;
    const CURRENT_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!EXTERNAL_KEY) {
      return new Response(JSON.stringify({ error: "EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const extClient = createClient(EXTERNAL_URL, EXTERNAL_KEY);
    const curClient = createClient(CURRENT_URL, CURRENT_KEY);

    // ============ NEW: Full scan of external DB ============
    if (action === "scan") {
      const tableResults: Record<string, { count: number | null; error?: string }> = {};
      const storageResults: Record<string, { count: number; error?: string; sample?: string[] }> = {};

      // Scan tables (count rows)
      await Promise.all(TABLES_TO_SCAN.map(async (table) => {
        try {
          const { count, error } = await extClient
            .from(table)
            .select("*", { count: "exact", head: true });
          if (error) {
            tableResults[table] = { count: null, error: error.message };
          } else {
            tableResults[table] = { count: count ?? 0 };
          }
        } catch (e) {
          tableResults[table] = { count: null, error: String(e) };
        }
      }));

      // Scan storage buckets (top-level only)
      await Promise.all(BUCKETS_TO_SCAN.map(async (b) => {
        try {
          const { data, error } = await extClient.storage.from(b).list("", { limit: 1000 });
          if (error) {
            storageResults[b] = { count: 0, error: error.message };
          } else {
            const files = (data || []).filter(i => i.id !== null);
            const folders = (data || []).filter(i => i.id === null);
            storageResults[b] = {
              count: files.length + folders.length,
              sample: [
                ...files.slice(0, 3).map(f => `📄 ${f.name}`),
                ...folders.slice(0, 3).map(f => `📁 ${f.name}/`),
              ],
            };
          }
        } catch (e) {
          storageResults[b] = { count: 0, error: String(e) };
        }
      }));

      const tableSummary = Object.entries(tableResults)
        .filter(([_, v]) => (v.count ?? 0) > 0 || v.error)
        .sort(([, a], [, b]) => (b.count ?? -1) - (a.count ?? -1));

      return new Response(JSON.stringify({
        external_url: EXTERNAL_URL,
        scanned_at: new Date().toISOString(),
        tables_with_data: Object.fromEntries(tableSummary),
        empty_tables: Object.entries(tableResults).filter(([_, v]) => v.count === 0 && !v.error).map(([k]) => k),
        storage_buckets: storageResults,
        total_rows: Object.values(tableResults).reduce((sum, v) => sum + (v.count ?? 0), 0),
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============ Existing: list files ============
    if (action === "list-files") {
      const { data, error } = await extClient.storage.from(bucket).list(folder || "", { limit: 500, offset: 0 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const files = (data || []).filter(i => i.id !== null).map(i => i.name);
      const folders = (data || []).filter(i => i.id === null).map(i => i.name);
      return new Response(JSON.stringify({ files, folders, total: files.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============ Existing: copy batch ============
    if (action === "copy-batch") {
      const { data: items } = await extClient.storage.from(bucket).list(folder || "", { limit, offset });
      if (!items) return new Response(JSON.stringify({ copied: 0, done: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const files = items.filter(i => i.id !== null);
      let copied = 0;
      const errors: string[] = [];

      for (const file of files) {
        const fullPath = folder ? `${folder}/${file.name}` : file.name;
        try {
          const { data: fileData, error: dlErr } = await extClient.storage.from(bucket).download(fullPath);
          if (dlErr || !fileData) { errors.push(`dl:${fullPath}`); continue; }
          const { error: upErr } = await curClient.storage.from(bucket).upload(fullPath, fileData, { upsert: true });
          if (upErr) { errors.push(`up:${fullPath}:${upErr.message}`); continue; }
          copied++;
        } catch (e) {
          errors.push(`${fullPath}:${String(e)}`);
        }
      }

      return new Response(JSON.stringify({
        copied, errors: errors.slice(0, 10),
        hasMore: items.length >= limit,
        nextOffset: offset + limit
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: scan | list-files | copy-batch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

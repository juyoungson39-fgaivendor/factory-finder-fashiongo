import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTERNAL_URL = "https://zvzqategpvsxaobzolfd.supabase.co";
const FALLBACK_USER_ID = "5989122f-c80d-462e-be4f-789e40b5de77";

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
    const { action, bucket, folder, table, offset = 0, limit = 100 } = body;

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

    // ============ Scan ============
    if (action === "scan") {
      const tableResults: Record<string, { count: number | null; error?: string }> = {};
      const storageResults: Record<string, { count: number; error?: string; sample?: string[] }> = {};

      await Promise.all(TABLES_TO_SCAN.map(async (t) => {
        try {
          const { count, error } = await extClient.from(t).select("*", { count: "exact", head: true });
          tableResults[t] = error ? { count: null, error: error.message } : { count: count ?? 0 };
        } catch (e) { tableResults[t] = { count: null, error: String(e) }; }
      }));

      await Promise.all(BUCKETS_TO_SCAN.map(async (b) => {
        try {
          const { data, error } = await extClient.storage.from(b).list("", { limit: 1000 });
          if (error) { storageResults[b] = { count: 0, error: error.message }; }
          else {
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
        } catch (e) { storageResults[b] = { count: 0, error: String(e) }; }
      }));

      return new Response(JSON.stringify({
        external_url: EXTERNAL_URL,
        scanned_at: new Date().toISOString(),
        tables: tableResults,
        storage_buckets: storageResults,
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============ Transfer table data ============
    if (action === "transfer-table") {
      if (!table) {
        return new Response(JSON.stringify({ error: "table is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Fetch external rows
      const { data: rows, error: fetchErr } = await extClient
        .from(table)
        .select("*")
        .range(offset, offset + limit - 1);

      if (fetchErr) {
        return new Response(JSON.stringify({ error: `fetch: ${fetchErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!rows || rows.length === 0) {
        return new Response(JSON.stringify({ inserted: 0, skipped: 0, done: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Get existing IDs in current DB to skip duplicates
      const ids = rows.map((r: any) => r.id).filter(Boolean);
      const { data: existing } = await curClient.from(table).select("id").in("id", ids);
      const existingIds = new Set((existing || []).map((r: any) => r.id));

      // Filter new rows + ensure user_id valid
      const newRows = rows
        .filter((r: any) => !existingIds.has(r.id))
        .map((r: any) => {
          if ("user_id" in r && !r.user_id) {
            r.user_id = FALLBACK_USER_ID;
          }
          return r;
        });

      const skipped = rows.length - newRows.length;
      let inserted = 0;
      const errors: string[] = [];

      if (newRows.length > 0) {
        const { error: insErr, count } = await curClient
          .from(table)
          .insert(newRows, { count: "exact" });
        if (insErr) {
          errors.push(insErr.message);
          // Try one-by-one to salvage as many as possible
          for (const row of newRows) {
            const { error: e } = await curClient.from(table).insert(row);
            if (!e) inserted++;
            else errors.push(`row ${row.id}: ${e.message}`);
          }
        } else {
          inserted = count ?? newRows.length;
        }
      }

      return new Response(JSON.stringify({
        table,
        fetched: rows.length,
        inserted,
        skipped,
        errors: errors.slice(0, 5),
        nextOffset: offset + limit,
        hasMore: rows.length >= limit,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============ List storage files ============
    if (action === "list-files") {
      const { data, error } = await extClient.storage.from(bucket).list(folder || "", { limit: 1000, offset: 0 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const files = (data || []).filter(i => i.id !== null).map(i => i.name);
      const folders = (data || []).filter(i => i.id === null).map(i => i.name);
      return new Response(JSON.stringify({ files, folders, total: files.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============ Copy storage batch ============
    if (action === "copy-batch") {
      const { data: items } = await extClient.storage.from(bucket).list(folder || "", { limit, offset });
      if (!items) return new Response(JSON.stringify({ copied: 0, done: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const files = items.filter(i => i.id !== null);
      let copied = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const file of files) {
        const fullPath = folder ? `${folder}/${file.name}` : file.name;
        try {
          const { data: fileData, error: dlErr } = await extClient.storage.from(bucket).download(fullPath);
          if (dlErr || !fileData) { errors.push(`dl:${fullPath}`); continue; }
          const { error: upErr } = await curClient.storage.from(bucket).upload(fullPath, fileData, { upsert: false });
          if (upErr) {
            if (upErr.message.includes("already exists") || upErr.message.includes("duplicate")) {
              skipped++;
            } else {
              errors.push(`up:${fullPath}:${upErr.message}`);
            }
            continue;
          }
          copied++;
        } catch (e) {
          errors.push(`${fullPath}:${String(e)}`);
        }
      }

      return new Response(JSON.stringify({
        copied, skipped, errors: errors.slice(0, 10),
        hasMore: items.length >= limit,
        nextOffset: offset + limit
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: scan | transfer-table | list-files | copy-batch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

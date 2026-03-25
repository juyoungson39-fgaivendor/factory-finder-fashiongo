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

    if (action === "get-columns") {
      // Get one row from sourceable_products to see all columns
      const { data, error } = await extClient.from("sourceable_products").select("*").limit(1);
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const columns = data && data.length > 0 ? Object.keys(data[0]) : [];
      return new Response(JSON.stringify({ columns, sample: data?.[0] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "migrate-filtered") {
      // Migrate sourceable_products but strip unknown columns
      const KNOWN_COLS = [
        "id", "user_id", "item_name", "item_name_en", "style_no", "vendor_name",
        "category", "fg_category", "unit_price", "unit_price_usd", "weight",
        "options", "image_url", "source_url", "source", "status", "notes",
        "factory_id", "trend_analysis_id", "created_at", "updated_at",
        "product_no", "price", "weight_kg", "material", "color_size",
        "purchase_link", "currency", "images", "is_uploaded", "size_chart"
      ];

      let allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await extClient.from("sourceable_products").select("*").range(from, from + 499);
        if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < 500) break;
        from += 500;
      }

      // Filter to only known columns
      const filtered = allRows.map(row => {
        const clean: Record<string, any> = {};
        for (const k of KNOWN_COLS) {
          if (k in row) clean[k] = row[k];
        }
        return clean;
      });

      const { error: insertError } = await curClient.from("sourceable_products").upsert(filtered, { onConflict: "id", ignoreDuplicates: true });
      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message, rows_attempted: filtered.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, rows_migrated: filtered.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "migrate-storage") {
      const buckets = ["factory-photos", "ai-generated-images"];
      const storageLog: Record<string, any> = {};

      for (const bucket of buckets) {
        try {
          let copied = 0;
          let errors: string[] = [];

          async function copyDir(path: string) {
            const { data: items } = await extClient.storage.from(bucket).list(path, { limit: 1000 });
            if (!items) return;
            for (const item of items) {
              const fullPath = path ? `${path}/${item.name}` : item.name;
              if (item.id === null) {
                await copyDir(fullPath);
              } else {
                const { data: fileData, error: dlError } = await extClient.storage.from(bucket).download(fullPath);
                if (dlError || !fileData) { errors.push(`dl:${fullPath}`); continue; }
                const { error: upError } = await curClient.storage.from(bucket).upload(fullPath, fileData, { upsert: true });
                if (upError) { errors.push(`up:${fullPath}:${upError.message}`); continue; }
                copied++;
              }
            }
          }

          await copyDir("");
          storageLog[bucket] = { copied, errors: errors.slice(0, 20) };
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

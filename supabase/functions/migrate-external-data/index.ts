import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, bucket, folder, offset = 0, limit = 10 } = await req.json();

    const EXTERNAL_URL = "https://zvzqategpvsxaobzolfd.supabase.co";
    const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const CURRENT_URL = Deno.env.get("SUPABASE_URL")!;
    const CURRENT_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const extClient = createClient(EXTERNAL_URL, EXTERNAL_KEY);
    const curClient = createClient(CURRENT_URL, CURRENT_KEY);

    if (action === "list-files") {
      const { data, error } = await extClient.storage.from(bucket).list(folder || "", { limit: 500, offset: 0 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const files = (data || []).filter(i => i.id !== null).map(i => i.name);
      const folders = (data || []).filter(i => i.id === null).map(i => i.name);
      return new Response(JSON.stringify({ files, folders, total: files.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "copy-batch") {
      // Copy a batch of files from external to current
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

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, bucket } = body;

    const EXTERNAL_URL = "https://zvzqategpvsxaobzolfd.supabase.co";
    const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!EXTERNAL_KEY) throw new Error("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY not set");

    const CURRENT_URL = Deno.env.get("SUPABASE_URL")!;
    const CURRENT_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const extClient = createClient(EXTERNAL_URL, EXTERNAL_KEY);
    const curClient = createClient(CURRENT_URL, CURRENT_KEY);

    if (action === "migrate-storage-bucket") {
      if (!bucket) throw new Error("bucket required");
      let copied = 0;
      const errors: string[] = [];

      async function copyDir(path: string) {
        const { data: items } = await extClient.storage.from(bucket).list(path, { limit: 500 });
        if (!items) return;
        for (const item of items) {
          const fullPath = path ? `${path}/${item.name}` : item.name;
          if (item.id === null) {
            await copyDir(fullPath);
          } else {
            try {
              const { data: fileData, error: dlError } = await extClient.storage.from(bucket).download(fullPath);
              if (dlError || !fileData) { errors.push(`dl:${fullPath}`); continue; }
              const { error: upError } = await curClient.storage.from(bucket).upload(fullPath, fileData, { upsert: true });
              if (upError) { errors.push(`up:${fullPath}:${upError.message}`); continue; }
              copied++;
            } catch (e) {
              errors.push(`err:${fullPath}:${String(e)}`);
            }
          }
        }
      }

      await copyDir("");
      return new Response(JSON.stringify({ bucket, copied, errors: errors.slice(0, 20) }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list-storage") {
      const results: Record<string, any> = {};
      for (const b of ["factory-photos", "ai-generated-images"]) {
        const { data, error } = await extClient.storage.from(b).list("", { limit: 100 });
        results[b] = error ? { error: error.message } : { items: data?.map(i => ({ name: i.name, id: i.id })) };
      }
      return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

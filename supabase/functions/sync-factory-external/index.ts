import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { action } = body;

    // Action: update-sync-status
    if (action === "update-sync-status") {
      const { factory_id, sync_status, platform_score_detail, repurchase_rate } = body;
      if (!factory_id) {
        return new Response(JSON.stringify({ error: "factory_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updatePayload: Record<string, any> = {
        sync_status: sync_status || "synced",
        last_synced_at: new Date().toISOString(),
      };

      if (platform_score_detail) {
        // Merge with existing
        const { data: existing } = await supabase
          .from("factories")
          .select("platform_score_detail")
          .eq("id", factory_id)
          .single();

        updatePayload.platform_score_detail = {
          ...((existing?.platform_score_detail as Record<string, any>) ?? {}),
          ...platform_score_detail,
        };
      }

      if (repurchase_rate != null) {
        updatePayload.repurchase_rate = repurchase_rate;
      }

      const { error } = await supabase.from("factories").update(updatePayload).eq("id", factory_id);
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: recalculate-score
    if (action === "recalculate-score") {
      const { factory_id } = body;
      if (!factory_id) {
        return new Response(JSON.stringify({ error: "factory_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase.rpc("recalculate_factory_score", { p_factory_id: factory_id });
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ success: true, score: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: batch-sync — update multiple factories at once
    if (action === "batch-sync") {
      const { factories } = body; // Array of { factory_id, platform_score_detail, repurchase_rate, sync_status }
      if (!Array.isArray(factories) || factories.length === 0) {
        return new Response(JSON.stringify({ error: "factories array is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results: { factory_id: string; success: boolean; error?: string }[] = [];

      for (const item of factories) {
        try {
          const { factory_id, platform_score_detail, repurchase_rate, sync_status } = item;

          const payload: Record<string, any> = {
            sync_status: sync_status || "synced",
            last_synced_at: new Date().toISOString(),
          };

          if (platform_score_detail) {
            const { data: existing } = await supabase
              .from("factories")
              .select("platform_score_detail")
              .eq("id", factory_id)
              .single();

            payload.platform_score_detail = {
              ...((existing?.platform_score_detail as Record<string, any>) ?? {}),
              ...platform_score_detail,
            };
          }

          if (repurchase_rate != null) {
            payload.repurchase_rate = repurchase_rate;
          }

          const { error } = await supabase.from("factories").update(payload).eq("id", factory_id);
          if (error) throw new Error(error.message);

          results.push({ factory_id, success: true });
        } catch (e: any) {
          results.push({ factory_id: item.factory_id, success: false, error: e.message });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: list-factories — get factories needing sync
    if (action === "list-factories") {
      const { platform_filter, status_filter, limit: queryLimit } = body;

      let query = supabase
        .from("factories")
        .select("id, name, source_url, source_platform, sync_status, last_synced_at")
        .is("deleted_at", null);

      if (platform_filter && platform_filter !== "all") {
        query = query.eq("source_platform", platform_filter);
      }
      if (status_filter) {
        query = query.eq("sync_status", status_filter);
      }

      const { data, error } = await query.limit(queryLimit || 500);
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ factories: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: update-sync-status, recalculate-score, batch-sync, list-factories" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("sync-factory-external error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

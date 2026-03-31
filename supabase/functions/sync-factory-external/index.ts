import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    // Action: recalculate-score — uses platform_score_detail fields
    if (action === "recalculate-score") {
      const { factory_id } = body;
      if (!factory_id) {
        return new Response(JSON.stringify({ error: "factory_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: factory, error: fetchErr } = await supabase
        .from("factories")
        .select("platform_score_detail")
        .eq("id", factory_id)
        .single();
      if (fetchErr) throw new Error(fetchErr.message);

      const detail = (factory?.platform_score_detail as Record<string, any>) ?? {};
      const fields = ["quality", "dispute", "logistics", "exchange", "consultation"];
      const values = fields.map(f => parseFloat(detail[f]) || 0);
      const sum = values.reduce((a, b) => a + b, 0);
      const score = parseFloat(((sum / 5) * 20).toFixed(2));

      const { error: updateErr } = await supabase
        .from("factories")
        .update({ overall_score: score })
        .eq("id", factory_id);
      if (updateErr) throw new Error(updateErr.message);

      return new Response(JSON.stringify({ success: true, score }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: batch-sync — update multiple factories or set pending by IDs
    if (action === "batch-sync") {
      const { factories, factory_ids } = body;

      // Mode 1: factory_ids only — set status to pending
      if (Array.isArray(factory_ids) && factory_ids.length > 0) {
        const { error: updateError } = await supabase
          .from("factories")
          .update({ sync_status: "pending" })
          .in("id", factory_ids);

        if (updateError) throw new Error(updateError.message);

        return new Response(JSON.stringify({ success: true, message: `Sync initiated for ${factory_ids.length} factories.` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mode 2: factories array with detailed data (does NOT touch overall_score)
      if (!Array.isArray(factories) || factories.length === 0) {
        return new Response(JSON.stringify({ error: "factories array or factory_ids array is required" }), {
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

    // Action: bulk-recalculate — recalculate overall_score for all factories with platform_score_detail
    if (action === "bulk-recalculate") {
      const { data: allFactories, error: fetchErr } = await supabase
        .from("factories")
        .select("id, platform_score_detail")
        .is("deleted_at", null)
        .not("platform_score_detail", "is", null);
      if (fetchErr) throw new Error(fetchErr.message);

      const fields = ["quality", "dispute", "logistics", "exchange", "consultation"];
      const results: { factory_id: string; score: number }[] = [];

      for (const f of (allFactories || [])) {
        const detail = (f.platform_score_detail as Record<string, any>) ?? {};
        const values = fields.map(k => parseFloat(detail[k]) || 0);
        const sum = values.reduce((a, b) => a + b, 0);
        const score = parseFloat(((sum / 5) * 20).toFixed(2));

        await supabase.from("factories").update({ overall_score: score }).eq("id", f.id);
        results.push({ factory_id: f.id, score });
      }

      return new Response(JSON.stringify({ success: true, updated: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: update-sync-status, recalculate-score, batch-sync, list-factories, bulk-recalculate" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("sync-factory-external error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

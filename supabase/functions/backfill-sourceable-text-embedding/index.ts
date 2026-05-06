// Backfill text embeddings for sourceable_products using same model as trend_analyses
// Model: gemini-embedding-001, 768 dims (matches generate-embedding fn)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TEXT_EMBEDDING_MODEL = "gemini-embedding-001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(vec: number[]): number[] {
  const m = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return m === 0 ? vec : vec.map((v) => v / m);
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const url = `${GEMINI_API_BASE}/models/${TEXT_EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${TEXT_EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return normalize(data.embedding.values as number[]);
}

// deno-lint-ignore no-explicit-any
function buildInputText(row: Record<string, any>): string {
  const name = row.item_name_en || row.item_name || "unknown";
  const category = row.fg_category || row.category || "";
  const material = row.detected_material || row.material || "";
  const colorSize = Array.isArray(row.detected_colors)
    ? row.detected_colors.join(", ")
    : (row.color_size || "");
  let text = `${name} | category=${category} | material=${material} | color_size=${colorSize}`;
  if (row.description) text += ` | desc=${row.description}`;
  if (row.image_description) text += ` | img_desc=${row.image_description}`;
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required env vars");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(body.batch_size ?? 50, 1), 200);
    const dryRun = !!body.dry_run;

    const { data: rows, error: fetchErr } = await supabase
      .from("sourceable_products")
      .select("id, item_name, item_name_en, category, fg_category, material, detected_material, color_size, detected_colors, description, image_description, vendor_name")
      .is("embedding", null)
      .limit(batchSize);

    if (fetchErr) throw new Error(`fetch: ${fetchErr.message}`);
    if (!rows || rows.length === 0) {
      return json({ processed: 0, succeeded: 0, failed: 0, remaining_null: 0, message: "nothing to backfill" });
    }

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const row of rows) {
      try {
        const text = buildInputText(row);
        const embedding = await embedText(text, GEMINI_API_KEY);
        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("sourceable_products")
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", row.id);
          if (upErr) throw new Error(upErr.message);
        }
        succeeded++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ id: row.id, error: msg });
        console.error(`row ${row.id}:`, msg);
      }
    }

    const { count: remaining } = await supabase
      .from("sourceable_products")
      .select("*", { count: "exact", head: true })
      .is("embedding", null);

    return json({
      processed: rows.length,
      succeeded,
      failed,
      remaining_null: remaining ?? null,
      dry_run: dryRun,
      ...(errors.length ? { errors: errors.slice(0, 20) } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("backfill error:", msg);
    return json({ error: msg }, 500);
  }
});

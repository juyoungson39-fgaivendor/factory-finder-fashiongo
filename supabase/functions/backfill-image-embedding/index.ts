// Backfill image embeddings for sourceable_products OR trend_analyses.
// Uses gemini-embedding-001 multimodal (text+image), 768-dim, L2 normalized.
// Same model as text embeddings — vectors live in same space, cosine is meaningful.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-embedding-001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED = new Set(["sourceable_products", "trend_analyses"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bufToB64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

async function fetchImage(url: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Lovable" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!ct.startsWith("image/")) return null;
    const buf = await r.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 5 * 1024 * 1024) return null;
    return { b64: bufToB64(buf), mime: ct };
  } catch {
    return null;
  }
}

function normalize(v: number[]): number[] {
  const m = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return m === 0 ? v : v.map((x) => x / m);
}

async function embedImage(text: string, b64: string, mime: string, key: string): Promise<number[] | null> {
  const url = `${GEMINI_API_BASE}/models/${MODEL}:embedContent?key=${key}`;
  const body = JSON.stringify({
    model: `models/${MODEL}`,
    content: { parts: [{ text }, { inlineData: { mimeType: mime, data: b64 } }] },
    outputDimensionality: 768,
  });
  // up to 4 retries on 429/5xx with exponential backoff
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) {
      const d = await res.json();
      return normalize(d.embedding.values as number[]);
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      console.warn(`embed ${res.status}, retry in ${wait}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    console.warn(`embed fail ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return null;
}

interface Row {
  id: string;
  image_url: string | null;
  text: string;
}

async function fetchSourceable(sb: any, limit: number): Promise<Row[]> {
  const { data, error } = await sb
    .from("sourceable_products")
    .select("id, image_url, image_url_mirror, item_name, item_name_en, fg_category, category")
    .is("image_embedding", null)
    .or("image_url.not.is.null,image_url_mirror.not.is.null")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    // Prefer mirror URL (re-hosted on our storage) over original (often blocked)
    image_url: r.image_url_mirror || r.image_url,
    text: `${r.item_name_en || r.item_name || ""} | ${r.fg_category || r.category || ""}`.trim(),
  })).filter((r: Row) => !!r.image_url);
}

async function fetchTrends(sb: any, limit: number): Promise<Row[]> {
  const { data, error } = await sb
    .from("trend_analyses")
    .select("id, source_data, image_url_mirror, trend_keywords")
    .is("image_embedding", null)
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: any) => {
      const sd = r.source_data ?? {};
      const url = r.image_url_mirror || sd.image_url || sd.thumbnail_url || null;
      const text = [sd.trend_name, sd.title, sd.caption, (r.trend_keywords ?? []).join(" ")]
        .filter(Boolean).join(" ").slice(0, 500) || "fashion image";
      return { id: r.id, image_url: url, text };
    })
    .filter((r: Row) => !!r.image_url);
}

// Concurrency-limited map (max 5 in flight)
async function pmap<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const KEY = Deno.env.get("GEMINI_API_KEY");
    const URL_ = Deno.env.get("SUPABASE_URL");
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!KEY || !URL_ || !SR) throw new Error("Missing env");

    const sb = createClient(URL_, SR);
    const body = await req.json().catch(() => ({}));
    const table: string = body.table || "sourceable_products";
    const batchSize = Math.min(Math.max(body.batch_size ?? 20, 1), 100);
    const concurrency = Math.min(Math.max(body.concurrency ?? 5, 1), 8);

    if (!ALLOWED.has(table)) return json({ error: `invalid table: ${table}` }, 400);

    const rows = table === "sourceable_products"
      ? await fetchSourceable(sb, batchSize)
      : await fetchTrends(sb, batchSize);

    if (rows.length === 0) {
      return json({ table, processed: 0, succeeded: 0, failed: 0, skipped: 0, message: "nothing to backfill" });
    }

    let succeeded = 0, failed = 0, skipped = 0;
    const errors: Array<{ id: string; reason: string }> = [];

    await pmap(rows, concurrency, async (row) => {
      try {
        if (!row.image_url) {
          skipped++; errors.push({ id: row.id, reason: "no image_url" }); return;
        }
        const img = await fetchImage(row.image_url);
        if (!img) {
          skipped++; errors.push({ id: row.id, reason: "image fetch failed" }); return;
        }
        const vec = await embedImage(row.text || "fashion product", img.b64, img.mime, KEY);
        if (!vec) {
          failed++; errors.push({ id: row.id, reason: "embed api failed" }); return;
        }
        const { error: upErr } = await sb
          .from(table)
          .update({ image_embedding: JSON.stringify(vec) })
          .eq("id", row.id);
        if (upErr) { failed++; errors.push({ id: row.id, reason: `update: ${upErr.message}` }); return; }
        succeeded++;
      } catch (e: any) {
        failed++; errors.push({ id: row.id, reason: e?.message || String(e) });
      }
    });

    // remaining count
    const { count: remaining } = await sb
      .from(table).select("id", { count: "exact", head: true }).is("image_embedding", null);

    return json({
      table, processed: rows.length, succeeded, failed, skipped,
      remaining_null: remaining ?? null,
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

// Mirror blocked/unfetchable image hosts into our own Supabase Storage bucket
// so the embedding pipeline can succeed.
//
// Flow per row:
//   1. Try direct fetch with browser-like headers.
//   2. If that fails (network error, non-200, non-image), retry through
//      Apify proxy (APIFY_API_TOKEN required) — works for cbu01.alicdn.com
//      and other geo/UA-restricted hosts.
//   3. Upload bytes to the `factory-photos` bucket and write the public URL
//      back into `image_url_mirror`.
//
// POST body: { table?: 'sourceable_products' | 'trend_analyses', batch_size?: number,
//              concurrency?: number, host_filter?: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED = new Set(["sourceable_products", "trend_analyses"]);
const BUCKET = "factory-photos";
const MIRROR_FOLDER = "mirror";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Row {
  id: string;
  image_url: string;
}

async function fetchDirect(url: string): Promise<{ buf: ArrayBuffer; mime: string } | null> {
  try {
    const referer = (() => {
      try { const u = new URL(url); return `${u.protocol}//${u.host}/`; } catch { return undefined; }
    })();
    const headers = { ...BROWSER_HEADERS, ...(referer ? { Referer: referer } : {}) };
    const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!ct.startsWith("image/")) return null;
    const buf = await r.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 8 * 1024 * 1024) return null;
    return { buf, mime: ct };
  } catch {
    return null;
  }
}

async function fetchViaApify(url: string, token: string): Promise<{ buf: ArrayBuffer; mime: string } | null> {
  // Apify "url-screenshot/binary-fetcher" alternative: use the cheerio-scraper
  // actor isn't ideal for binary. Apify exposes a proxy gateway:
  //   http://auto:APIFY_TOKEN@proxy.apify.com:8000
  // Deno's `fetch` doesn't honor an HTTP CONNECT proxy directly, so we instead
  // call Apify's "Apify Proxy" via the request fetcher run-sync endpoint.
  try {
    const apiUrl = `https://api.apify.com/v2/acts/apify~http-request/run-sync-get-dataset-items?token=${token}&timeout=30`;
    const body = {
      url,
      method: "GET",
      headers: BROWSER_HEADERS,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      saveBody: true,
    };
    const r = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const items = await r.json().catch(() => null);
    const item = Array.isArray(items) ? items[0] : null;
    if (!item) return null;
    const b64 = item.body || item.responseBody || null;
    const ct = (item.contentType || item.headers?.["content-type"] || "image/jpeg").split(";")[0].trim();
    if (!b64 || !ct.startsWith("image/")) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { buf: bytes.buffer, mime: ct };
  } catch {
    return null;
  }
}

function extFromMime(mime: string): string {
  const m = mime.split("/")[1] || "jpg";
  return m.replace("jpeg", "jpg");
}

async function fetchSourceable(sb: any, limit: number, host?: string): Promise<Row[]> {
  let q = sb
    .from("sourceable_products")
    .select("id, image_url")
    .is("image_url_mirror", null)
    .is("image_embedding", null)
    .not("image_url", "is", null)
    .neq("image_url", "")
    .limit(limit);
  if (host) q = q.ilike("image_url", `%${host}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r: any) => !!r.image_url) as Row[];
}

async function fetchTrends(sb: any, limit: number, host?: string): Promise<Row[]> {
  // No top-level image_url on trend_analyses — it's in source_data->>image_url
  const { data, error } = await sb
    .from("trend_analyses")
    .select("id, source_data, image_url_mirror")
    .is("image_url_mirror", null)
    .is("image_embedding", null)
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: any) => {
      const sd = r.source_data ?? {};
      const url = sd.image_url || sd.thumbnail_url || null;
      return { id: r.id, image_url: url };
    })
    .filter((r: Row) => !!r.image_url && (!host || r.image_url.includes(host)));
}

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
    const URL_ = Deno.env.get("SUPABASE_URL");
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const APIFY = Deno.env.get("APIFY_API_TOKEN") || "";
    if (!URL_ || !SR) throw new Error("Missing env");

    const sb = createClient(URL_, SR);
    const body = await req.json().catch(() => ({}));
    const table: string = body.table || "sourceable_products";
    const batchSize = Math.min(Math.max(body.batch_size ?? 20, 1), 100);
    const concurrency = Math.min(Math.max(body.concurrency ?? 4, 1), 6);
    const hostFilter: string | undefined = body.host_filter || undefined;

    if (!ALLOWED.has(table)) return json({ error: `invalid table: ${table}` }, 400);

    const rows = table === "sourceable_products"
      ? await fetchSourceable(sb, batchSize, hostFilter)
      : await fetchTrends(sb, batchSize, hostFilter);

    if (rows.length === 0) {
      return json({ table, processed: 0, mirrored: 0, skipped: 0, message: "nothing to mirror" });
    }

    let mirrored = 0, skipped = 0, viaDirect = 0, viaApify = 0;
    const errors: Array<{ id: string; url: string; reason: string }> = [];

    await pmap(rows, concurrency, async (row) => {
      try {
        let img = await fetchDirect(row.image_url);
        if (img) viaDirect++;
        if (!img && APIFY) {
          img = await fetchViaApify(row.image_url, APIFY);
          if (img) viaApify++;
        }
        if (!img) {
          skipped++;
          errors.push({ id: row.id, url: row.image_url, reason: APIFY ? "direct+apify failed" : "direct failed (no APIFY_API_TOKEN)" });
          return;
        }
        const ext = extFromMime(img.mime);
        const path = `${MIRROR_FOLDER}/${table}/${row.id}.${ext}`;
        const { error: upErr } = await sb.storage
          .from(BUCKET)
          .upload(path, new Uint8Array(img.buf), { contentType: img.mime, upsert: true });
        if (upErr) { skipped++; errors.push({ id: row.id, url: row.image_url, reason: `upload: ${upErr.message}` }); return; }
        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
        const mirrorUrl = pub.publicUrl;
        const { error: dbErr } = await sb.from(table).update({ image_url_mirror: mirrorUrl }).eq("id", row.id);
        if (dbErr) { skipped++; errors.push({ id: row.id, url: row.image_url, reason: `db: ${dbErr.message}` }); return; }
        mirrored++;
      } catch (e: any) {
        skipped++;
        errors.push({ id: row.id, url: row.image_url, reason: e?.message || String(e) });
      }
    });

    return json({
      table, processed: rows.length, mirrored, skipped,
      via: { direct: viaDirect, apify: viaApify },
      apify_enabled: !!APIFY,
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

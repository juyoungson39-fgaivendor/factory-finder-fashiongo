import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function fetchHtml(url: string): Promise<string> {
  const FC_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (FC_KEY) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${FC_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["html", "markdown"],
          onlyMainContent: false,
          waitFor: 2500,
          location: { country: "CN", languages: ["zh-CN"] },
        }),
      });
      clearTimeout(t);
      if (res.ok) {
        const j = await res.json();
        const html = j?.data?.html ?? j?.html ?? j?.data?.rawHtml ?? "";
        const md = j?.data?.markdown ?? j?.markdown ?? "";
        return (html || "") + "\n" + (md || "");
      }
    } catch (e) {
      console.log("[resolve-detail-to-shop] firecrawl error:", e instanceof Error ? e.message : String(e));
    }
  }
  // direct fallback
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://www.1688.com/",
      },
    });
    clearTimeout(t);
    return res.ok ? await res.text() : "";
  } catch (_e) {
    return "";
  }
}

function extractShopId(html: string): string | null {
  if (!html) return null;
  // Pattern 1: subdomain in shop links (offerlist / index / creditdetail)
  const p1 = html.match(/https?:\/\/([a-z0-9_-]+)\.1688\.com\/page\/(?:index|offerlist|creditdetail)/i);
  if (p1 && p1[1] && p1[1].toLowerCase() !== "detail" && p1[1].toLowerCase() !== "www") {
    return p1[1].toLowerCase();
  }
  // Pattern 2: 进入店铺 anchor
  const p2 = html.match(/进入店铺[\s\S]{0,500}?https?:\/\/([a-z0-9_-]+)\.1688\.com/i);
  if (p2 && p2[1] && p2[1].toLowerCase() !== "detail" && p2[1].toLowerCase() !== "www") {
    return p2[1].toLowerCase();
  }
  // Pattern 3: pageData / sellerLoginId / domain
  const p3 = html.match(/"(?:domain|memberId|loginId|sellerLoginId)"\s*:\s*"([a-z0-9_-]+)"/i);
  if (p3 && p3[1] && /^[a-z0-9_-]{3,}$/i.test(p3[1])) {
    return p3[1].toLowerCase();
  }
  // Pattern 4: any subdomain (excluding common non-shop hosts)
  const p4 = html.match(/https?:\/\/([a-z0-9_-]+)\.1688\.com/gi);
  if (p4) {
    const blacklist = new Set([
      "detail", "www", "login", "show", "ai", "club", "creator",
      "service", "air", "search", "home", "img", "cbu01", "site",
      "static", "s", "i", "g-search1", "g-search2", "ma", "report",
      "page", "qd", "sale", "show", "cn", "consumer", "wholesaler",
    ]);
    for (const url of p4) {
      const m = url.match(/https?:\/\/([a-z0-9_-]+)\.1688\.com/i);
      if (m && !blacklist.has(m[1].toLowerCase()) && m[1].length >= 4) {
        return m[1].toLowerCase();
      }
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const { factory_id, url: directUrl } = body as { factory_id?: string; url?: string };

    let factory: { id: string; source_url: string | null; name: string } | null = null;
    let detailUrl: string | null = null;

    if (factory_id) {
      const { data, error } = await supabase
        .from("factories")
        .select("id, source_url, name")
        .eq("id", factory_id)
        .maybeSingle();
      if (error || !data) return json({ ok: false, reason: "factory_not_found" }, 404);
      factory = data;
      detailUrl = data.source_url;
    } else if (directUrl) {
      detailUrl = directUrl;
    } else {
      return json({ ok: false, reason: "missing_factory_id_or_url" }, 400);
    }

    if (!detailUrl || !/detail\.1688\.com\/offer\//i.test(detailUrl)) {
      return json({ ok: false, reason: "not_a_detail_url", source_url: detailUrl }, 400);
    }

    console.log(`[resolve-detail-to-shop] fetching ${detailUrl}`);
    const html = await fetchHtml(detailUrl);
    if (!html || html.length < 500) {
      if (factory) {
        await supabase
          .from("factories")
          .update({
            score_status: "blocked",
          })
          .eq("id", factory.id);
      }
      return json({ ok: false, reason: "fetch_failed", html_len: html.length }, 502);
    }

    const shopId = extractShopId(html);
    console.log(`[resolve-detail-to-shop] extracted shop_id=${shopId}`);

    if (!shopId) {
      if (factory) {
        await supabase
          .from("factories")
          .update({ score_status: "blocked" })
          .eq("id", factory.id);
      }
      return json({ ok: false, reason: "shop_id_not_found", preview: html.slice(0, 500) }, 422);
    }

    const newSourceUrl = `https://${shopId}.1688.com/page/offerlist.htm`;

    if (factory) {
      const { error: upErr } = await supabase
        .from("factories")
        .update({ shop_id: shopId, source_url: newSourceUrl, source_platform: "1688" })
        .eq("id", factory.id);
      if (upErr) {
        return json({ ok: false, reason: "update_failed", message: upErr.message }, 500);
      }
    }

    // Enqueue
    const { error: qErr } = await supabase.from("manual_crawl_queue").insert({
      url: newSourceUrl,
      status: "pending",
    });
    if (qErr) console.log("[resolve-detail-to-shop] enqueue error:", qErr.message);

    return json({
      ok: true,
      factory_id: factory?.id ?? null,
      factory_name: factory?.name ?? null,
      shop_id: shopId,
      new_source_url: newSourceUrl,
      enqueued: !qErr,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[resolve-detail-to-shop] error:", msg);
    return json({ ok: false, reason: "internal_error", message: msg }, 500);
  }
});

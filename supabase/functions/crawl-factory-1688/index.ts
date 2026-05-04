import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(t);
      if (res.ok) return await res.text();
    } catch (_e) {
      // retry
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return "";
}

function clip10(n: number) {
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

function priceStats(prices: number[]) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sum / sorted.length) * 100) / 100,
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function avgOrSignal(moqs: number[], signals: { mixed_batch: boolean; dropshipping: boolean }) {
  if (signals.dropshipping) return 10;
  if (signals.mixed_batch) return 8;
  if (!moqs.length) return 5;
  const avg = moqs.reduce((a, b) => a + b, 0) / moqs.length;
  if (avg <= 2) return 10;
  if (avg <= 5) return 8;
  if (avg <= 10) return 6;
  if (avg <= 30) return 4;
  return 2;
}

function extractSales(text: string) {
  const matches = [...text.matchAll(/已售\s*(\d+(?:\.\d+)?[wk万]?)/g)]
    .map((m) => m[1])
    .slice(0, 10);
  return matches;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, visit_notes } = await req.json();
    if (!url || typeof url !== "string") {
      return json({ ok: false, reason: "invalid_url" }, 400);
    }

    // Validate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, reason: "unauthorized" }, 401);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return json({ ok: false, reason: "unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // 1) URL parse
    let shop_id: string | null = null;
    let canonical = url;
    let offer_id: string | null = null;

    const subM = url.match(/https?:\/\/([a-z0-9_]+)\.1688\.com/i);
    const detM = url.match(/detail\.1688\.com\/offer\/(\d+)/);

    if (subM && subM[1].toLowerCase() !== "detail") {
      shop_id = subM[1];
      canonical = `https://${shop_id}.1688.com/page/offerlist.htm`;
    } else if (detM) {
      offer_id = detM[1];
      const detailHtml = await fetchWithRetry(url);
      const sub = detailHtml.match(
        /https?:\/\/([a-z0-9_]+)\.1688\.com\/page\/offerlist/i,
      );
      if (sub) {
        shop_id = sub[1];
        canonical = `https://${shop_id}.1688.com/page/offerlist.htm`;
      } else {
        return json(
          { ok: false, reason: "shop_id_extract_failed", offer_id },
          422,
        );
      }
    } else {
      return json({ ok: false, reason: "invalid_url" }, 400);
    }

    // 2) shop page fetch
    const html = await fetchWithRetry(canonical);
    if (!html || html.length < 5000) {
      return json({ ok: false, reason: "fetch_blocked_or_empty" }, 502);
    }

    // 3) regex extract
    const text = html.replace(/<[^>]+>/g, " ");
    const yrs = parseInt(text.match(/入驻\s*(\d+)\s*年/)?.[1] ?? "0", 10);
    const svc = parseFloat(text.match(/服务分\s*([\d.]+)/)?.[1] ?? "0");
    const ret = parseInt(text.match(/回头率\s*(\d+)%/)?.[1] ?? "0", 10);
    const cnt = parseInt(text.match(/共\s*(\d+)\s*件相关产品/)?.[1] ?? "0", 10);
    const fans = text.match(/([\d.]+[wk万]?)\s*粉丝/)?.[1] ?? null;
    const main_cat = text.match(/主营类目[:：]\s*([^\s<]+)/)?.[1] ?? null;
    const prices = [...text.matchAll(/¥\s*(\d+(?:\.\d+)?)/g)]
      .map((m) => parseFloat(m[1]))
      .slice(0, 30);
    const moqs = [...text.matchAll(/(\d+)\s*件起订/g)].map((m) =>
      parseInt(m[1], 10),
    );
    const signals = {
      mixed_batch: /混批/.test(text),
      dropshipping: /一件代发|代发/.test(text),
      custom_accepted: /接受定制|OEM|ODM/.test(text),
    };

    // 4) Phase 1 scores
    const p1 = {
      self_shipping: 3.0,
      image_quality: 7.0,
      moq: avgOrSignal(moqs, signals),
      lead_time: clip10(yrs * 0.5 + ret * 0.05),
      communication:
        svc >= 3.0 ? 10 : svc >= 2.0 ? 7 : svc > 0 ? 4 : 5,
      variety:
        cnt >= 500 ? 10 : cnt >= 200 ? 7 : cnt >= 100 ? 4 : cnt > 0 ? 1 : 5,
    };

    // 5) raw
    const raw = {
      fan_count: fans,
      main_category: main_cat,
      price_stats: priceStats(prices),
      signals,
      top_sales: extractSales(text),
      offer_id,
      crawled_at: new Date().toISOString(),
    };

    // 6) UPSERT — service role
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const inferredName =
      text.match(
        /([\u4e00-\u9fa5]+(?:服饰|服装|贸易|实业|有限公司|供应链)[\u4e00-\u9fa5]*)/,
      )?.[1] ?? shop_id;

    // Find existing factory by shop_id
    const { data: existing } = await supa
      .from("factories")
      .select("id, user_id")
      .eq("shop_id", shop_id)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      shop_id,
      source_url: canonical,
      source_platform: "1688",
      name: existing ? undefined : inferredName,
      raw_crawl_data: raw,
      raw_service_score: svc || null,
      raw_return_rate: ret || null,
      raw_product_count: cnt || null,
      raw_years_in_business: yrs || null,
      p1_self_shipping_score: p1.self_shipping,
      p1_image_quality_score: p1.image_quality,
      p1_moq_score: p1.moq,
      p1_lead_time_score: p1.lead_time,
      p1_communication_score: p1.communication,
      p1_variety_score: p1.variety,
      score_status: "ai_scored",
      ai_scored_at: new Date().toISOString(),
      visited_in_person: !!visit_notes,
      visit_notes: visit_notes ?? null,
    };

    let factoryId: string;
    if (existing) {
      const { error: upErr } = await supa
        .from("factories")
        .update(payload)
        .eq("id", existing.id);
      if (upErr) {
        return json(
          { ok: false, reason: "db_error", detail: upErr.message },
          500,
        );
      }
      factoryId = existing.id;
    } else {
      const { data: ins, error: insErr } = await supa
        .from("factories")
        .insert({ ...payload, user_id: userId })
        .select("id")
        .single();
      if (insErr || !ins) {
        return json(
          {
            ok: false,
            reason: "db_error",
            detail: insErr?.message ?? "insert_failed",
          },
          500,
        );
      }
      factoryId = ins.id;
    }

    return json({
      ok: true,
      factory_id: factoryId,
      shop_id,
      canonical,
      scores: p1,
      raw_summary: {
        years: yrs,
        service: svc,
        return_rate: ret,
        product_count: cnt,
        fan_count: fans,
      },
    });
  } catch (e) {
    return json(
      {
        ok: false,
        reason: "exception",
        detail: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});

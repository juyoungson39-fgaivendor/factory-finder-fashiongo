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

type FetchDiag = {
  status: number | null;
  length: number;
  content_type: string | null;
  via: 'firecrawl' | 'direct' | 'none';
  blocked_signals: { captcha: boolean; login_wall: boolean; anti_bot: boolean };
  body_preview: string;
};

function detectBlockedSignals(html: string) {
  const h = html || '';
  return {
    captcha: /punish|captcha|verify/i.test(h),
    login_wall: h.includes('登录') || /login\.html/i.test(h),
    anti_bot: h.includes('异常访问') || h.includes('滑动验证'),
  };
}

async function fetchWithRetry(url: string, retries = 1): Promise<{ html: string; diag: FetchDiag }> {
  const diag: FetchDiag = {
    status: null, length: 0, content_type: null, via: 'none',
    blocked_signals: { captcha: false, login_wall: false, anti_bot: false },
    body_preview: '',
  };
  // 1688 blocks direct edge fetches; route through Firecrawl for HTML extraction.
  const FC_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (FC_KEY) {
    for (let i = 0; i <= retries; i++) {
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
        diag.status = res.status;
        diag.content_type = res.headers.get('content-type');
        diag.via = 'firecrawl';
        if (res.ok) {
          const j = await res.json();
          const html = j?.data?.html ?? j?.html ?? j?.data?.rawHtml ?? "";
          const md = j?.data?.markdown ?? j?.markdown ?? "";
          const combined = (html || "") + "\n" + (md || "");
          diag.length = combined.length;
          diag.body_preview = combined.slice(0, 2000);
          diag.blocked_signals = detectBlockedSignals(combined);
          console.log(`[crawl-1688] firecrawl status=${res.status} len=${combined.length} signals=${JSON.stringify(diag.blocked_signals)}`);
          console.log(`[crawl-1688] preview: ${diag.body_preview.slice(0, 500)}`);
          if (combined.length > 1000) return { html: combined, diag };
        } else {
          console.log(`[crawl-1688] firecrawl HTTP ${res.status}`);
        }
      } catch (e) {
        console.log(`[crawl-1688] firecrawl error: ${e instanceof Error ? e.message : String(e)}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  // Fallback: direct fetch with browser-like headers
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.1688.com/',
        'sec-ch-ua': '"Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(t);
    diag.status = res.status;
    diag.content_type = res.headers.get('content-type');
    diag.via = 'direct';
    const txt = res.ok ? await res.text() : '';
    diag.length = txt.length;
    diag.body_preview = txt.slice(0, 2000);
    diag.blocked_signals = detectBlockedSignals(txt);
    console.log(`[crawl-1688] direct status=${res.status} len=${txt.length} signals=${JSON.stringify(diag.blocked_signals)}`);
    if (res.ok && txt.length > 1000) return { html: txt, diag };
  } catch (e) {
    console.log(`[crawl-1688] direct error: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { html: '', diag };
}

function clip10(n: number) {
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

function priceStats(prices: number[]) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    sample_count: sorted.length,
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
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, reason: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

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
      const { html: detailHtml } = await fetchWithRetry(url);
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

    console.log(`[crawl-1688] canonical=${canonical} (input=${url})`);

    // 2) shop page fetch
    const { html, diag } = await fetchWithRetry(canonical);
    if (!html || html.length < 1000) {
      return json({ ok: false, reason: "fetch_blocked_or_empty", canonical, diag }, 502);
    }

    // 3) regex extract
    const text = html.replace(/<[^>]+>/g, " ");
    const yrs = parseInt(text.match(/入驻\s*(\d+)\s*年/)?.[1] ?? "0", 10);
    const svc = parseFloat(text.match(/服务分\s*([\d.]+)/)?.[1] ?? "0");
    const ret = parseInt(text.match(/回头率\s*(\d+)%/)?.[1] ?? "0", 10);
    const cnt = parseInt(text.match(/共\s*(\d+)\s*件相关产品/)?.[1] ?? "0", 10);
    const fans = text.match(/([\d.]+[wk万]?)\s*粉丝/)?.[1] ?? null;
    const main_cat = text.match(/主营类目[:：]\s*([^\s<]+)/)?.[1] ?? null;
    const ontime_rate = (() => {
      const m = text.match(/(?:48H履约率|按时发货率|准时发货率)\s*([\d.]+)\s*%/);
      return m ? parseFloat(m[1]) : null;
    })();
    const positive_review_rate = (() => {
      const m = text.match(/(?:好评率|正面评价率)\s*([\d.]+)\s*%/);
      return m ? parseFloat(m[1]) : null;
    })();
    const established = text.match(/成立(?:时间|于)?[:：]?\s*(\d{4})[-./年]\s*(\d{1,2})?/);
    const established_year = established ? parseInt(established[1], 10) : null;
    const established_month = established && established[2] ? parseInt(established[2], 10) : null;
    const subcategory_count = (() => {
      const m = text.match(/经营(?:范围|类目)[:：][^\n]{0,200}/);
      if (!m) return null;
      const parts = m[0].split(/[、,，;；\/]/).filter(s => s.trim().length > 1);
      return parts.length > 1 ? parts.length : null;
    })();
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

    // 5a) Contact info — fetch dedicated contactinfo page
    const contactUrl = `https://${shop_id}.1688.com/page/contactinfo.htm`;
    const { html: contactHtml } = await fetchWithRetry(contactUrl);
    const contactText = (contactHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const pickFirst = (re: RegExp) => {
      const m = contactText.match(re);
      return m ? m[1].trim().replace(/\s+/g, " ") : null;
    };
    const contact = {
      person: pickFirst(/联\s*系\s*人[:：]\s*([^\s<>:：]{1,40})/),
      fixed_phone: pickFirst(/(?:固\s*定\s*电\s*话|电\s*话|固\s*话)[:：]\s*([\d\-\(\)\s转分机]{6,40})/),
      mobile: pickFirst(/(?:移\s*动\s*电\s*话|手\s*机)[:：]\s*([\d\-\s]{6,30})/),
      address: pickFirst(/地\s*址[:：]\s*([^<>]{4,200}?)(?=\s{2,}|联系|电话|传真|邮编|网址|$)/),
      fax: pickFirst(/传\s*真[:：]\s*([\d\-\s]{6,30})/),
      postcode: pickFirst(/邮\s*编[:：]\s*(\d{4,8})/),
      wechat: pickFirst(/(?:微\s*信|WeChat)[:：]\s*([A-Za-z0-9_\-]{3,40})/i),
    };
    console.log(`[crawl-1688] contact extracted: ${JSON.stringify(contact)}`);

    // 5) raw
    const raw = {
      fan_count: fans,
      main_category: main_cat,
      ontime_rate,
      positive_review_rate,
      established_year,
      established_month,
      subcategory_count,
      price_stats: priceStats(prices),
      signals,
      top_sales: extractSales(text),
      offer_id,
      contact,
      crawled_at: new Date().toISOString(),
    };

    // 6) UPSERT — service role
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const inferredName =
      text.match(
        /([\u4e00-\u9fa5]+(?:服饰|服装|贸易|实业|有限公司|供应链)[\u4e00-\u9fa5]*)/,
      )?.[1] ?? shop_id;

    // Combined phone string: prefer fixed, append mobile if both present
    const combinedPhone = [contact.fixed_phone, contact.mobile]
      .filter(Boolean)
      .join(" / ") || null;

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
      contact_name: contact.person || undefined,
      contact_phone: combinedPhone || undefined,
      contact_wechat: contact.wechat || undefined,
      p1_self_shipping_score: p1.self_shipping,
      p1_image_quality_score: p1.image_quality,
      p1_moq_score: p1.moq,
      p1_lead_time_score: p1.lead_time,
      p1_communication_score: p1.communication,
      p1_variety_score: p1.variety,
      score_status: "ai_scored",
      ai_scored_at: new Date().toISOString(),
      p1_crawled_at: new Date().toISOString(),
      visited_in_person: !!visit_notes,
      visit_notes: visit_notes ?? null,
    };
    // Strip undefined so we don't overwrite existing values with null
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

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
      contact,
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
